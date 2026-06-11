# ADR-025: Govern Concurrent Work by Convention, Not Mechanism

## Status

Proposed.

Concurrent work is governed by **advisory conventions plus one hard append-only invariant** — decided here. The
doctrine itself ships with this work unit (`strategy-concurrent-work` and the `assess-parallel-fit` method); the
*enforcement* of the conventions it states ships with the sibling cohort members — the behind-base detector and
the foreign-write backstop (`merge-safety-mechanism`), the single-owner-per-WU model (`single-owner-wu-model`),
and the awaiting-review lifecycle seam (`async-merge-lifecycle`). Promote to Accepted when this work unit
integrates.

## Context

The worktree substrate for parallel work has shipped — per-WU worktrees, session-init worktree-awareness,
branch-gone recovery, the advisory in-flight activation check, and the `Class` plate-balance signal ([ADR-019],
[ADR-023]). Mechanism without conventions, though, invites exactly the undisciplined parallelism the project's
principles warn against (P3 focused execution; P2 co-development bandwidth). The open question was *patterns of
use*: when concurrent work units help versus fragment attention, what keeps concurrent branches integrable and
cross-machine-safe, and how shipped-but-awaiting-review work composes with active work.

Two temptations pulled toward **encoding** that discipline as mechanism rather than convention:

1. A `**Focus Role:**` meta field (`primary | companion | awaiting-external | parked`), with blessed pairings,
   swap discipline, and per-WU tenure tracking — a tool-enforced model of attention.
2. An overlap-prediction tool that computes, for any candidate work unit, whether it is "safe to parallelize"
   against the in-flight set.

External research ran in two independent directions and undercut both:

- A **PM-tool survey** (`research-active-work-coordination-vocabulary`) found no precedent for role annotation:
  every tool surveyed (Linear, Jira, GitHub Projects, Shortcut, Notion, Asana, Trello, Height) models active work
  as a **Status enum + Assignee**, never a focus-role field.
- A **worktree-tool convergence pass** over eleven agent-workspace tools (`research-worktree-tool-convergence`;
  Conductor, emdash, Maestro, Warp, Worktrunk, Zed, Super, Superset, T3code, Soloterm, Nora) found none modeling
  focus role either — and found every one optimizing for *many simultaneous sessions, fast spawn, minimal per-WU
  review*, the **opposite posture** to ARC's fewer-deeper-reviewed default. The same pass confirmed the two
  ecosystems compose by sitting on the shared git-worktree substrate, with no extension-point integration.

The underlying *concepts* — single-thread attention, WIP limits, attention-residue, awaiting-review as a distinct
state — are well-grounded (`research-focus-wip-attention-discipline`, aligned across Kanban, Deep Work, and GTD).
What the research rejected was **expressing them as net-new tracked vocabulary a tool enforces**, rather than as
conventions an operator applies by judgment. The branch/merge mechanics and parallelize-vs-serialize heuristics
the doctrine codifies are likewise research-grounded (`research-concurrent-work-mechanism-layer`,
`research-integration-conflict-handling`).

A live incident sharpened the one place where convention is not enough. On **2026-06-10**, a laptop-scaffolded
branch was rebased and force-pushed from the primary worktree, orphaning the laptop's pre-rebase tip; it was
recovered losslessly via `git reset --hard origin/<branch>`. The lesson is narrow and hard: a pushed branch
serving as a live multi-machine sync target must never be rewritten. Worktrees are *enabling hygiene* here, not a
guarantee — a per-WU worktree removes the *occasion* for a mid-flight rebase but cannot *prevent* a rebase +
force-push.

### Alternatives considered

- **A `Focus Role` meta field** (with blessed pairings and `**Focus Since:**` tenure tracking). Rejected. Each
  proposed value maps to an existing signal: *primary* → which worktree the agent is in (implicit, no field);
  *awaiting-external* → `**State:** Integrating` ([ADR-019]'s state machine); *companion* → conflated runtime
  focus with backlog grouping, already covered by the cohort model ([ADR-024]); *parked* → soft Someday/Maybe
  guidance, not a field. The field would invent vocabulary adopters don't recognize and demand validation rules,
  migration of in-flight work units, and adopter education — to encode what agent judgment plus existing state
  already carry.
- **Overlap-prediction tooling.** Rejected. Automated overlap prediction over the candidate set is O(n²),
  false-positive-prone, and non-idiomatic — and likely not reliably computable at all: meta files don't declare
  file-scope, and predicted paths aren't the actual ones. Industry leans on conventions plus pick-time accounting
  (WIP limits, swimlane/value-stream partitioning, module ownership) over a computed "safe-to-parallelize," and
  the real safety net is the behind-base check at integration, not a prediction.
- **Inheriting team-mode conventions.** Concurrent usage could in principle reuse the `(@name)` markers and
  team-sync settings. Rejected: those are *cross-identity* (team) conventions, while concurrency is a
  *multi-work-unit* concern in which each work unit is single-owner regardless of team size. The two are
  structurally distinct — sibling, not subset.

## Decision

We will govern concurrent work by **advisory conventions plus one hard append-only invariant** — doctrine over
mechanism. Concretely:

**Conventions over tooling.** The discipline lives as adopter-facing doctrine (`strategy-concurrent-work`) and one
advisory, invocable judgment (`assess-parallel-fit`), consulted at the activation, errand, and pick-time surfaces.
No focus-role field is added; no overlap-prediction tool is built. Attention discipline is expressed as
conventions an operator applies by judgment — single-thread attention, avoid same-domain concurrents, switch at
review-increment boundaries — not as field validations a tool enforces.

**One hard invariant: append-only until integration.** A pushed work-unit branch is append-only from activation to
integration — add commits and fast-forward-push only; never rewrite already-pushed history. If the base is
genuinely needed mid-flight, *merge* it in (ancestry-preserving), never rebase onto it; integration is the single
sanctioned rewrite point. This is the one place the doctrine is a rule rather than advice, because the failure
mode — orphaning a machine's commits — is silent and lossy. It is framed as **git-branch-safety for shared
history**, never as "your branch is your permanent multi-machine state store" (see Forward-compatibility below).
The doctrine owns the convention; the behind-base detector (`merge-safety-mechanism`) is the enforcement backstop.

**Self/foreign asymmetry.** Every work unit is single-owner (`single-owner-wu-model`), which collapses the overlap
judgment to one question: is the overlapping work yours or another owner's? Self-overlap you reorder freely;
foreign-overlap you coordinate. This asymmetry is the whole "all-owner" addition the doctrine makes, and it
extends from file-level foreign-artifact writes down to entry-level re-homing of foreign-owned atomics.

**Sibling to team mode.** Concurrent-work conventions and team mode are orthogonal axes: team mode coordinates
*people* (cross-identity); concurrent-work coordinates *work units* (per-WU, single-owner). They compose, and
neither requires the other. This prevents the "do I enable team mode to run multiple work units?" confusion.

**Where the model lives.** The adopter-facing doctrine is `strategy-concurrent-work`; the advisory read is the
`assess-parallel-fit` method. The derived-vs-mutated shared-state split is [ADR-020]'s, the errand `chore/` branch
is [ADR-021]'s, managed-doc merge correctness is [ADR-022]'s, and the cohort model is [ADR-024]'s — this ADR
records only the durable concurrency *posture* and its rejections. The internal rationale the doctrine omits
(research citations, the focus-role ledger, the incident, the forward-compat reasoning below) is this ADR's sole
home.

**Forward-compatibility (storage).** Framing the pushed branch as the cross-machine sync substrate is **tier-1
(in-repo) truth, not permanent.** Under the materialized-git-backing-store direction, operational work-unit state
syncs via the backing store while the code branch carries code; the append-only *discipline* composes forward at
every tier (you never rewrite shared code history). This is precisely why the doctrine frames append-only as
git-branch-safety rather than branch-as-state-store — checked against `strategy-storage-evolution` Principles 2
(records storage-agnostic) and 5 (work-unit identity decoupled from branch identity). This reasoning stays
internal to this ADR, invisible to the shipping doctrine.

## Consequences

### Positive

- **No net-new vocabulary or tracked field.** Attention discipline rides existing signals — worktree presence, the
  `Integrating` state, the cohort model — plus agent judgment, instead of a field a tool must validate and migrate.
- **The one hard rule is narrowly scoped and genuinely hard.** A single, defensible invariant against a silent,
  lossy failure, with everything else left advisory — the strictness lands exactly where the cost of being wrong
  is unrecoverable.
- **Doctrine and mechanism stay decoupled.** The conventions ship now and the siblings enforce them later, with no
  build-order coupling — the doctrine references the behind-base detector and the foreign-write backstop without
  building them, so it can lead the cohort stack.
- **Composes with the external worktree-tool ecosystem** rather than competing with it: the same git substrate, no
  integration surface to maintain, and an explicit "pick which posture dominates per session" stance.

### Negative

- **The advisory reads depend on agent judgment, not enforcement.** Read quality hinges on adequate scope
  description and careful reading rather than a validated field; a thin `**Purpose:**` yields a conservative read,
  by design, but the floor is judgment.
- **Attention discipline is unenforced.** Nothing blocks an operator from running heavy concurrency that strains
  P2 co-development bandwidth. The doctrine documents the trade honestly rather than gating it — a deliberate
  choice to inform rather than restrict.
- **Two postures held in tension.** ARC's fewer-deeper-reviewed cadence and the tool ecosystem's
  many-faster-less-reviewed cadence must be reconciled by the operator, consciously, per session.

### Risks

- **Rubber-stamping under load.** The modest-concurrency posture (≈2–3 active) is a convention, not a cap; too
  many in-flight work units degrade the per-task review into a rubber stamp. Mitigation: the posture is stated,
  the `assess-parallel-fit` design-load read surfaces saturation, and honest framing reinforces the bound — but it
  is not enforced.
- **Append-only relies on convention and backstop together.** Worktrees remove the occasion but not the ability to
  rewrite a shared branch; the behind-base detector (`merge-safety-mechanism`) is the net, and until it ships the
  convention stands alone (the interim vanilla-git fallback carried in WORKING-MEMORY covered this window).
- **The single-owner premise precedes its enforcement.** The doctrine asserts single-owner ahead of
  `single-owner-wu-model`, which still must remove the `(@name)` / within-WU multi-dev apparatus from
  `strategy-team-coordination`; until then the two sibling strategies momentarily disagree, reconciled before
  anything ships to a team.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

---

[ADR-019]: adr-019-work-unit-lifecycle-reform.md
[ADR-020]: adr-020-adopt-principle-anchored-scalable-core.md
[ADR-021]: adr-021-introduce-errand-work-class.md
[ADR-022]: adr-022-managed-operational-state-documents.md
[ADR-023]: adr-023-class-model-scaled-ceremony.md
[ADR-024]: adr-024-cohort-decomposition-model.md
