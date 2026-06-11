# Spec (`detailed` · `PRD`): concurrent-work-doctrine

- **Origin:** `[internal]` — the conventions/doctrine half of the decomposed Concurrent Work Conventions concern
  (`agile-parallelism/concurrent-work-conventions` sub-cohort). The spine the three mechanism/model members
  (`merge-safety-mechanism`, `async-merge-lifecycle`, `single-owner-wu-model`) reference.

- **Purpose:** Ship the doctrine layer for principled multi-WU concurrent work as three artifacts — an
  adopter-facing strategy (`strategy-concurrent-work.md`) framing *when/why* to parallelize, an `assess-parallel-fit`
  method codifying the advisory *how*, and an internal ADR recording the durable rationale. Doctrine, not mechanism;
  the design target is **any team size**, solo as the degenerate case.

---

## Introduction

Worktree Foundation shipped the *mechanism* for parallel work (worktrees, session-init worktree-awareness,
branch-gone detection); Errand Enablement and In-Flight Awareness shipped the isolation and activation-check
substrate; `class-model-foundation` shipped the plate-balance signal. But mechanism without conventions encourages
chaos. The **patterns of multi-WU usage** are unaddressed: when concurrent WUs help versus fragment attention; how an
agent assesses whether a new WU is safe and wise to parallelize against in-flight work; what rebase/merge discipline
keeps concurrent branches integrable and cross-machine-safe; how shipped-but-awaiting-review WUs compose with active
ones; what distinguishes principled concurrent work from fragmented attention with predictable quality degradation.

PROJECT-PRD names undisciplined parallelism as a foundational failure mode while affirming that bounded, deliberate
concurrency has its place. This WU codifies that stance into operational doctrine, extending ARC's
attention-discipline principles into the multi-WU regime with guardrails rather than ceding the ground. **Why now:**
the mechanism has shipped, so the conventions gap is the live risk — mechanism alone, undocumented, invites exactly
the chaos the principles warn against.

## Goals

- Codify **when** concurrent WUs are appropriate versus counterproductive (parallelize-vs-serialize), as
  judgment-driven conventions, not enforced rules.
- Provide an **invocable, advisory judgment** (`assess-parallel-fit`) consulted consistently at the activation,
  errand, and pick-time surfaces — codified once, referenced everywhere.
- Codify **branch/rebase and append-only-until-integration discipline** that keeps concurrent branches integrable
  and cross-machine resume lossless.
- Codify **merge-ordering, async-merge, and worktree operational** guidance for the multi-WU and awaiting-review
  regimes.
- Frame all of it **adopter-facing and light-hand** — operational doctrine, not an internal-dev record — while
  recording the durable architectural rationale **internally** (an ADR) so the shipping doctrine stays clean.
- Compose forward with ARC's storage direction **without surfacing that concern in the adopter doctrine**.

## User Stories or Use Cases

- **As a developer with one WU in flight**, when I consider starting a second, I want an advisory read on whether
  it is safe *and* wise to parallelize, so I avoid attention fragmentation and late-stage merge drama.
- **As an agent at WU-activation or errand-launch**, I want one codified judgment to invoke, so the overlap read is
  consistent across fire-sites rather than re-derived (and re-stated) at each.
- **As a developer choosing next work from the ROADMAP's "Next" slice**, I want a conservative parallel-fit read
  over the candidates, so I pick concurrency-safe work without a tool pretending to compute safety it cannot.
- **As a developer resuming a pushed WU branch on a second machine**, I want unambiguous append-only discipline, so
  I never orphan a machine's commits via a mid-flight rebase + force-push.
- **As an adopter composing ARC with an external worktree-management tool**, I want guidance for holding the two
  postures (ARC's fewer-deeper-reviewed vs. the tool's many-faster-less-reviewed) in tension, so the disciplines
  reinforce rather than fight silently.

## Requirements

Grouped by deliverable. The enumerable substrate the task list is built from and validated against.

### A. `strategy-concurrent-work.md` — adopter-facing doctrine

A new strategy doc, **sibling** to `strategy-team-coordination.md` (not extending it — same-identity concurrency is
structurally distinct from cross-identity coordination), listed in `STRATEGY-INDEX.md`, cross-referencing
team-coordination where surfaces overlap (branching patterns, meta-file merge behavior).

- **R1 (P0) — Worktree-by-default rationale and trade-offs.** Why ARC departs from solo-developer norm (multi-agent
  isolation as primary justification, frictionless parallelism secondary); discovery and cleanup discipline; risks
  (worktree accumulation, "which worktree am I in" confusion).
- **R2 (P0) — Parallelize-vs-serialize framing.** Frame the decision and the **posture** — *principled at modest
  scale (≈2–3 concurrent), honest that heavier concurrency is the adopter's call and may strain P2 co-development
  bandwidth*. Reference `assess-parallel-fit` for the procedure; the strategy frames *when/why*, the method carries
  *how* (no rubric body restated here).
- **R3 (P0) — Branch and rebase discipline.** Periodic-rebase-onto-main vs. end-of-flight trade-off (lifetime
  threshold ≈2 days per industry research); `rerere` setup for periodic-rebase teams; "Update branch" workflows;
  merge-vs-rebase choice and its review consequences.
- **R4 (P0) — Append-only-until-integration.** A pushed WU branch is **append-only** mid-flight (activation →
  integration): only add commits and fast-forward-push; never rebase/amend already-pushed commits. Default: don't
  bring `main` into the WU branch mid-flight; if genuinely needed, **merge** `main` in (ancestry-preserving) rather
  than rebase onto it. Integration is the single sanctioned rewrite point; cross-machine resume is always
  `pull --ff-only` / `arc sync`. **Framed as git-branch-safety for shared history** — never as "the branch is your
  permanent multi-machine state store" (see R13 forward-compat). This doctrine **owns the convention**;
  `merge-safety-mechanism` owns the detection backstop.
- **R5 (P0) — Merge ordering between concurrent WUs.** First-in-wins vs. explicit serialization; "merge after #X"
  PR-label conventions; merge-queue interaction (GitHub merge queue, Mergify). Errand (`chore/`) branches are
  mini-PRs that ride the same ordering discipline.
- **R6 (P0) — Worktree operational guidance.** Performing merges from the primary (or a dedicated merge) worktree;
  refetching/rebasing other worktrees post-merge; `git worktree remove` over `rm -rf`; stale-reference recovery;
  cross-worktree state after a rebase; sync-all-worktrees recommendation. **Tool composition:** honor an external
  tool's branch naming, cleanup, and location conventions; don't relocate tool-managed worktrees; ARC's structural
  discipline (meta-`*` lifecycle, state machine, sweep-as-you-go) applies regardless of who spawned the worktree.
- **R7 (P0) — Async-merge guidance.** Managing WUs through awaiting-review latency (days to a week); how the
  `Integrating` state interacts with session-handoff, archival, and worktree cleanup; soft conventions for the
  post-PR-pre-merge state. (The lifecycle *mechanism* is `async-merge-lifecycle`'s; this carries the operator-facing
  conventions.)
- **R8 (P0) — When to abandon parallelism.** Heuristics: conflict-resolution time exceeding ≈30% of parallelism
  savings; rebase count exceeding ≈3 from upstream churn; semantic drift between branches. Recovery: merge one,
  abandon the other, redo as a unified WU.
- **R9 (P0) — Soft anti-pattern guidance.** Single-thread attention (one active focus at a time); avoid same-domain
  concurrents (attention-residue); review-increment-boundary discipline when transitioning between worktrees.
  **Explicit calibration against agentic worktree-tool idiom:** the surveyed ecosystem optimizes for many
  simultaneous sessions, fast spawn, less per-WU review — the opposite posture; surface the tension so adopters
  consciously pick which frame dominates per session. Judgment guidance, not enforced rules.
- **R10 (P0) — Main-worktree-under-full-protection convention.** "Your main worktree is not always on main": under
  `branch.protection: full`, the main worktree specializes for admin/coordination work (planning branches, archive
  branches, cross-WU backlog edits) while WU worktrees handle feature work.
- **R11 (P0) — Relationship to team mode.** State unambiguously: **orthogonal axes.** Team mode governs
  cross-identity coordination (multiple humans); concurrent-work conventions govern multi-WU concurrency mechanics,
  which apply per-WU whether the other in-flight WUs are yours or a teammate's (each WU is single-owner regardless).
  Both coexist; neither requires the other. (Prevents the "do I enable team mode to run multiple WUs?" confusion.)
- **R12 (P1) — ROADMAP concurrency-safety overlay.** An **on-contact convention, not a rendered/computed field** —
  meta files don't declare file-scope, predicted paths ≠ actual, so the read is coarse and deliberately
  conservative (the behind-base detector is the real net). Any hand-curated parallel view is a **sibling** artifact,
  never baked into the hand-maintenance-free derived ROADMAP. This member contributes only the convention on the
  "Next" slice; the renderer and horizon mode stay `roadmap-tooling`'s.
- **R13 (P0) — Philosophy-checkpoint coverage.** The doctrine explicitly addresses **P2** (parallelism is between
  WUs, not within; the per-task review stop is preserved), **P5** (worktree-local SESSION-NOTES is correct
  WU-scoped context, not degradation), **P7** (one task at a time stays within-WU; soft swap discipline at
  review-increment boundaries), and the **honest stance**: ARC won't *block* two simultaneous sessions, but
  documents that heavy concurrency may violate P2 — the adopter's call, not ARC's recommendation.
- **R14 (P0) — Shared-file concurrency conventions (the convention side of ADR-020's split).** Derived shared state
  (ROADMAP) is solvable in-git via deterministic regeneration at a single serialization point (post-merge on the
  integration branch, never hand-edited on feature branches); mutated shared state (inbox drains, human-editable
  ordering) is **not** in-git-solvable (backend territory — reference, do not solve here); `cohort-{name}.md` rides
  **per-member partition + the behind-base net** (partition-first; errand-through-primary escape hatch if partition
  proves insufficient). Convention coverage here; the detection *mechanism* rides `merge-safety-mechanism`. Where
  this restates content `strategy-work-organization` already owns (ROADMAP regen, the cohort model), **reference
  rather than duplicate** (see Open Questions).

### B. `assess-parallel-fit` — the codified judgment (method)

- **R15 (P0) — A new method** in `system/methods/`, standard shape (frontmatter `name`/`description`/`override-active`,
  override slot, default body). The single invocable home for the advisory parallelize-vs-serialize-or-coordinate
  judgment; the strategy frames and references it (DRY across the fire-sites that consume it).
- **R16 (P0) — Body: the overlap rubric.** Disjoint domain → **proceed**; shared module / strategy / load-bearing
  infra → **flag and consider sequencing**; foreign-owned overlap → **coordinate**.
- **R17 (P0) — Body: evidence-tiering** (scales to availability × stakes, never "Purpose only"):
    1. **Always** — `Purpose`/meta scope fields: the coarse baseline; for a bare Ready stub this is all there is, so
       the read leans conservative.
    2. **Escalate to the candidate's richest authored artifact** (`draft-*` → `spec-*`) when it exists *and* the
       cheap read is ambiguous or flags possible overlap — "richest artifact the candidate has," lifecycle-relative.
    3. **Cohort siblings → consult the `cohort-*` file first** — its dependency edges + Shared-contracts section are
       purpose-built coordination, the **primary and most authoritative** input for intra-cohort parallelism
       (cut-designed-disjoint → strong "safe"; a declared shared-contract or `Depends On` edge → the explicit
       serialize/coordinate signal).
- **R18 (P0) — Body: self/foreign asymmetry.** Single-owner WUs make this the entire "all-owner" addition —
  self-overlap reorder freely, foreign-overlap coordinate. Consumes the single-owner model that
  `single-owner-wu-model` supplies.
- **R19 (P0) — Body: proportionality guard.** Advisory, **never gating**; the behind-base detector is the real net.
  The default is the light read; deepen only on a flag worth resolving before committing to parallel. Never a
  pre-emptive heavyweight conflict-eval of every candidate (the rejected overlap-prediction posture).
- **R20 (P0) — Body: multi-candidate pick-time selection layer.** For the ROADMAP-read surface, where the judgment
  is a subset-selection rather than a single go/no-go: a WIP cap (the modest-concurrency posture), prefer
  disjoint-domain picks, don't stack two same-module Ready WUs.
- **R21 (P0) — Fire-site wiring.** `assess-parallel-fit` is the **doctrine layer over already-shipped advisory
  mechanism**, not a new fire-point. Wire it at three concrete surfaces, consuming the existing advisory CLIs
  rather than rebuilding them:
    - **WU-activation / cold-start / materialize** — consume the oracle's in-flight-set CLI (the session-init
      oracle slice) and apply the rubric.
    - **The errand surface** — the `run-errand` workflow (Launch), entered warm via the `arc-errand` skill or cold
      via `arc-session --errand`, where `arc errand check` already emits overlap facts (advisory, never blocks);
      the method consumes those facts and layers the rubric.
    - **Pick-time / next-work-discovery** — the session-init discovery surface (the multi-candidate selection of
      R20).

  Replace the previously-envisioned "thin pointers" with method invocations; **ground against what In-Flight
  Awareness and Errand Enablement actually shipped** (the advisory checks + oracle, not a bare probe) — add the
  method and declare it where each host workflow's frontmatter requires, do not rebuild fire-sites. (The conceptual
  "errand-launch" shorthand used across the corpus resolves to the concrete errand surface above.)
- **R22 (P0) — All-owner gate at entry-level writes.** The doctrine extends Errand Enablement's advisory
  foreign-artifact gate (file-level) to **entry-level** writes; owned here, surfaced mechanically by
  `merge-safety-mechanism`'s write-context extensions.

### C. The ADR — durable rationale (internal-only)

- **R23 (P0) — A new ADR** (next sequential — `adr-025-*`) in `reference/adr/`, recording the durable architectural
  decision: concurrent work governed by **advisory conventions plus one hard append-only invariant**; **no**
  focus-role field; **no** overlap-prediction tooling (doctrine over mechanism). Internal-only — never referenced
  from any adopter-facing surface.
- **R24 (P0) — ADR content.** The conventions-over-tooling posture; the **focus-role-field rejection** (with its
  external-research grounding and the cost ledger); the **append-only-until-integration rationale** (including the
  2026-06-10 incident as grounding); the self/foreign asymmetry decision; the sibling-to-team-mode (orthogonal
  axes) decision.
- **R25 (P0) — ADR cites the evidence base.** The five research files already in `reference/supplemental/research/`
  (`research-focus-wip-attention-discipline`, `research-active-work-coordination-vocabulary`,
  `research-concurrent-work-mechanism-layer`, `research-integration-conflict-handling`,
  `research-worktree-tool-convergence`) — cited in place; the strategy doc cites **none** of them. Anchor to the
  governing ADRs per the cohort record: adr-019 (single-branch-per-WU substrate), adr-020 (derived-vs-mutated
  split), adr-021 (errand `chore/` branches), adr-022 (managed-doc merge correctness), adr-024 (cohort model).
- **R26 (P0) — ADR records the storage forward-compat reasoning.** Append-only framed as git-branch-safety is
  **tier-1, not permanent** (under the materialized-backing-store direction, operational WU state syncs via the
  backing store, not the code branch); checked against `strategy-storage-evolution` Principles 2 & 5. Internal to
  the ADR — invisible to the shipping doctrine.

### D. Framing & audience discipline (cross-cutting)

- **R27 (P0) — Adopter-facing light-hand for `strategy-concurrent-work.md`.** Operational framing only — *what to
  do*, with just enough *why* for an operator to apply judgment. The doc **excludes**: research citations, the
  rejected-alternatives ledger (focus-role and overlap-prediction live in the ADR), the 2026-06-10 incident
  retelling, `strategy-storage-evolution` references, internal-roadmap forward-pointers (sibling/other-cohort WU
  names as in-flight scope), and `adopter`-POV framing. The model and conventions are *stated*, not justified
  beyond operational need (it is doctrine, not an ADR). Per DEV-RULES.PROJECT § Audience Boundaries — the
  internal "why" routes to the ADR (R23–R26); the strategy ships clean.

## Non-Goals

Each is an explicit boundary against a sibling member or another cohort — the seams the cohort record assigns
elsewhere.

- **The merge-safety *mechanism*** — the behind-base/`origin/<base>`-distance primitive + probe slot, the
  append-only detection backstop (patch-equal supersession downgrade + reset offer), write-context extensions, the
  pre-commit backstop hook, the merge-commit hook/footer exemption. → `merge-safety-mechanism`. (This doctrine
  *narrates* the detector as a convention; it does not build it.)
- **The async-merge *lifecycle mechanism*** — the suspend/resume seam, the in-flight completion sweep, the
  `arc start` create-new worktree-spawning wiring, the subdir-removal primitive, cohort-doc session-init discovery.
  → `async-merge-lifecycle`.
- **The single-owner-WU *model rewrite*** — rewriting `strategy-team-coordination` + DEV-RULES.ARC § Task interlock,
  removing `(@name)` and the within-WU multi-dev apparatus. → `single-owner-wu-model`. (This doctrine *consumes* the
  self/foreign asymmetry that rewrite supplies.)
- **The ROADMAP renderer, render grammar, horizon mode, and the `ROADMAP → STATUS.PROJECT` rename.** →
  `roadmap-tooling`. This contributes only the concurrency-safety overlay convention (R12).
- **The cross-machine-sync layer** — local base-ref staleness, partial-push trust, notes-ref coherence. →
  `cross-machine-sync-coherence` (which *extends* the behind-base primitive).
- **New overlap-probe / overlap-prediction tooling** — automated overlap prediction is O(n²), false-positive-prone,
  and non-idiomatic. Rejected; doctrine over mechanism. (Soft rubrics are *not* what's rejected.)
- **A `Focus Role` meta field, blessed pairings, or per-WU tenure tracking.** Rejected (rationale recorded in the
  ADR, not re-litigated in the doctrine).
- **Deep per-tool integration docs** for external worktree managers — light onboarding guidance only (R9).
- **In-git solutions for mutated shared state** — backend territory; referenced, not solved (R14).

## Technical Considerations

- **Substrate (all shipped) the doctrine grounds against:** Work Organization Reform (the `Integrating` state,
  per-worktree isolation, the group-dir convention), Worktree Foundation (the worktree mechanism), Errand
  Enablement (the `errand-launch` primitive + the advisory foreign-artifact gate floor this extends), In-Flight
  Awareness (the oracle-backed activation check + its fire-sites this wraps with the method), and
  `class-model-foundation` (the `Class` plate-balance input).
- **Soft prerequisite:** `out-of-wu-entry` (ships ahead) — mid-WU errand/housekeep entry, which the all-owner gate
  at the errand surface (R22) assumes already works.
- **Sibling consumption is by reference, not build-order coupling.** The doctrine *narrates* the behind-base
  detector (`merge-safety-mechanism`) and *keys on* the single-owner asymmetry (`single-owner-wu-model`); it points
  at conventions the siblings later enforce, so it can be authored as the spine ahead of them — which is why it
  leads the stack.
- **Grounding obligation (cohort soft-coordination):** ground all method fire-site wiring (R21) against shipped
  In-Flight Awareness reality before adding — audit-don't-rebuild.
- **Package-project sync.** `strategy-concurrent-work.md` and `assess-parallel-fit.md` are Framework files →
  two-copy discipline (package source + `.arc/`). The ADR is **`.arc/`-only** (`.arc/reference/adr/`, not part of
  the package-source two-copy set) per DEV-RULES.PROJECT § Architecture Documentation. The research files already
  sit in their permanent home; nothing relocates.
- **No new tech** — method, strategy, and ADR slot into documented customization/reference surfaces
  (TECHNICAL-OVERVIEW § 2) over the existing git/worktree substrate.

## Success Criteria

Validated explicitly at work-unit completion.

1. **`strategy-concurrent-work.md`** exists as a sibling to `strategy-team-coordination.md`, indexed in
   `STRATEGY-INDEX.md`, covering R1–R14, and passing markdown lint.
2. **`assess-parallel-fit`** exists in `system/methods/` with standard method shape, is declared in the relevant
   workflow frontmatter and invoked at the three fire-site surfaces (R21), and the strategy **references** it with
   no duplicated rubric body (verifiable: the disjoint/shared/foreign rubric appears in the method, not restated in
   the strategy).
3. **The ADR** exists in `reference/adr/`, records the four decisions (conventions-over-tooling, focus-role
   rejection, append-only invariant, team-mode orthogonality), cites the five research files, and is **internal-only**
   — no adopter-facing surface references it (verifiable by scan).
4. **Audience discipline holds** — the strategy doc contains no leak patterns: no research citations, no
   rejected-alternatives ledger, no incident retelling, no `strategy-storage-evolution` reference, no
   internal-roadmap forward-pointers, no `adopter`-POV framing (verifiable by scan against DEV-RULES.PROJECT §
   Audience Boundaries).
5. **Forward-compat holds** — append-only is framed as git-branch-safety, not branch-as-permanent-state-store; the
   storage-evolution reasoning lives only in the ADR (R26).
6. **The team-mode relationship is stated unambiguously** (R11) — a reader cannot come away thinking team mode is
   required to run multiple WUs.
7. **The standing `WORKING-MEMORY` note** "Multi-WU integration discipline — vanilla-git fallback (until
   `concurrent-work-doctrine` lands)" is dischargeable on ship.
8. **Cross-references reconciled** — `strategy-team-coordination` sibling links land on both sides; any DEV-RULES
   pointer to the doctrine resolves.

## Open Questions

**Resolve before starting:** none — form (`detailed` · PRD), the three-deliverable set, and the framing constraints
are settled.

**Resolve during work:**

- **Exact fire-site wiring and CLI composition for `assess-parallel-fit`** (R21) — confirm the exact command names
  (the oracle's in-flight-set CLI; `arc errand check` at the `run-errand` surface), how the method composes with
  those existing advisory CLIs (consume their facts vs. re-invoke them), which host workflows declare the method in
  frontmatter, and whether pick-time / next-work-discovery is a clean invocation point or needs a thin host.
  Grounding pass at task-generation / execution.
- **Inline vs. cross-reference for the shared-file conventions** (R14) — whether the ROADMAP-regen serialization
  point and the cohort-doc partition are stated inline in `strategy-concurrent-work` or cross-referenced from
  `strategy-work-organization` (which owns ROADMAP regen + the cohort model). Lean: reference, don't duplicate
  ADR-020/024-owned content.
- **ADR shape** — confirm next sequential number (`adr-025`) at authoring; whether the append-only invariant and
  the conventions-posture are one ADR or split (lean: one).
