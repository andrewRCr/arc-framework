# Plan: ROADMAP Form-Factor Evolution

**Purpose:** Re-shape ARC's forward-looking sequencing artifact (`ROADMAP.md`) so it absorbs WU
churn without per-edit drift and expresses parallel work streams as a first-class concern. Today
the ROADMAP encodes per-WU upstream/downstream pointers in a flat single-strand sequence —
brittle under WU splits / renames / re-sequencing, and structurally unable to represent the
parallel work that Worktree Foundation + Agile WU Lifecycle make real.

- **State:** Draft — pre-PRD exploration captured during PR #23 review on 2026-04-30. Iteration
  expected before PRD promotion.

- **Created:** 2026-04-30

- **Origin:** Surfaced during CodeRabbit review of the Interlock Foundation PR. CR flagged the
  Interlock Foundation entry's `Downstream:` list as stale — `Work-Unit Mobility` had been split
  into Worktree Foundation + Concurrent Work Conventions, and Coord Probe (post-frame addition)
  wasn't listed. Verifying the finding revealed the broader pattern: the per-WU upstream /
  downstream / sibling pointers throughout the doc require a coordinated edit every time a WU
  splits, renames, gets re-sequenced, or is added — and that pattern fails routinely. Subsumes
  scope item 5 ("ROADMAP parallelism format") previously parked in
  [plan-concurrent-work-conventions][concurrent-work].

---

## Problem / Motivation

### Issue 1 — Brittleness / sequencing churn

The current ROADMAP encodes commitments at fine granularity: every WU carries an explicit
`Upstream:` / `Downstream:` / `Sibling:` block listing the specific WUs it depends on or feeds.
This shape is double-bookkeeping with the plan docs themselves (which already carry their own
upstream/downstream prose) and creates O(n) drift surface every time the WU graph shifts:

- **WU split** — `Work-Unit Mobility` → `Worktree Foundation` + `Concurrent Work Conventions`.
  Every `Upstream:` line referencing the parent must be reconciled to the children.
- **WU rename** — `arc-modes` → `ARC Operating Modes`. Every cross-reference drifts until the
  next sweep.
- **WU re-sequencing** — Session-Init Optimization inserted between Work-Status Restructure and
  ARCd Rebrand. Every downstream pointer needs review.
- **New WU surfaces** — Coord Probe surfaces post-frame. Every WU it now relates to needs
  pointer updates.

The drift accumulates silently between sweeps. PR #23 review caught one stale list (Interlock
Foundation's Downstream); other stale pointers almost certainly exist elsewhere.

**Industry conventions to research** for managing forward-looking sequencing artifacts at solo /
small-team scale:

- **Now / Next / Later** (Janna Bastow, ProdPad) — three horizons with decreasing commitment.
  Near-term concrete, mid-term thematic, long-term aspirational.
- **GO / Themes / Outcomes / Goals** product-roadmap formats — outcome-anchored rather than
  feature-sequenced.
- **Rolling-wave planning** (PMI body of knowledge) — detailed near-term, progressive
  elaboration further out.
- **Opportunity Solution Tree** (Teresa Torres) — opportunity-anchored with multiple solution
  branches, no fixed sequence.
- **OKR-linked roadmaps** — quarterly outcomes anchor mid-term work; specific WU sequencing is
  emergent.
- **Shape Up cycles** (Basecamp) — bounded six-week appetites with cool-down; explicit
  rejection of long-horizon roadmaps.

The right adaptation for ARC is likely a hybrid: concrete near-term horizon (next 1-2 WUs with
real upstream/downstream pointers), thematic mid-term (a few quarters out — themes, not WUs),
exploratory backlog (capture without sequencing). Reduces churn by removing the requirement to
keep distant pointers accurate.

### Issue 2 — Parallel / multi-stream support

The current ROADMAP is structurally single-strand. Parallel sibling WUs (e.g., User Sync UX,
Coord Probe, Worktree Foundation as a "first wave" after Session-Operational Flow) are
represented in flat sequence with inline status markers — visually sequential even when
semantically concurrent. The dependency tree at the bottom (`## Dependency Analysis`) gestures
at parallelism with branching arrows but doesn't actually encode swimlanes or concurrent
execution paths.

This works today because solo execution is genuinely sequential — only one WU is "in progress"
at a time. Once Worktree Foundation + Agile WU Lifecycle ship, multi-WU parallelism becomes
real (worktree-isolated WUs, focus-role conventions, atomic/quick/standard tier mix). The
ROADMAP needs to express:

- **Concurrent execution lanes** — which WUs can / are running in parallel
- **Dependency surfaces, not strict ordering** — "X must precede Y on the same surface" vs.
  "X and Y can ship in any order"
- **Stream-of-work tracking** — which lane / focus-role / worktree owns which WU

At team scale (post-1.0, multiple developers / agent pairs), the current shape fails outright —
no representation of who's working what stream, what's blocked vs. parallelizable, what's been
claimed.

**Industry conventions to research:**

- **Swimlane diagrams** — process / role / stream lanes; common in BPMN and Kanban.
- **DAG visualizations** — Mermaid graphs, GraphViz, dependency-only ordering.
- **Multi-stream Kanban / portfolio Kanban** — concurrent flows with WIP limits per stream.
- **Cycle / iteration calendars** — Shape Up-style horizontal time visualization.

---

## Working Thesis

ROADMAP is a **forward-looking commitment artifact**, not a project-management database. The
current shape conflates two concerns:

1. **Near-term sequencing** (next 1-2 WUs) — needs concrete pointers because the work is real
   and the dependencies bind.
2. **Mid/long-term direction** — needs themes and outcomes, not WU-level pointers, because the
   pointers will shift before the work starts and the doc shouldn't lock them in.

**Likely direction:** Tiered horizons + lane-aware visualization for the near-term tier. Plan
docs remain the authoritative source for their own upstream/downstream prose (single source of
truth); ROADMAP stops duplicating that information in a brittle parallel structure.

This is **not** a "delete the dependency analysis" plan. The tree at the bottom of the current
ROADMAP is genuinely useful at a glance — it just needs to be regenerated from plan-doc
metadata rather than hand-maintained.

---

## Scope (provisional)

1. **Industry research pass.** Survey forward-looking sequencing-artifact conventions —
   Now/Next/Later, OKR-linked, Shape Up, Opportunity Solution Trees, rolling-wave, GO format,
   portfolio Kanban. Synthesize what fits ARC's solo-to-small-team scale. Output captured as
   `research-roadmap-conventions.md`.

2. **Tiered horizon model.** Define horizon tiers (e.g., Now / Next / Later, or
   Concrete / Thematic / Exploratory). Specify per-tier commitment level and required fields.
   Near-term tier carries upstream/downstream pointers; mid/long tiers don't.

3. **Lane-aware visualization for near-term tier.** Research swimlanes / DAG / Mermaid options
   for representing concurrent WUs in the near-term horizon. Pick one that renders adequately
   in markdown / GitHub.

4. **Pointer single-source-of-truth refactor.** Stop duplicating upstream/downstream in ROADMAP
   when plan docs already carry it. Either generate ROADMAP's near-term tier from plan-doc
   metadata, or drop the per-WU pointer blocks from ROADMAP entirely (rely on plan docs).

5. **Parallelism strategy alignment.** Coordinate with [Worktree Foundation][wf] (mechanism),
   [Agile WU Lifecycle][awl] (tier model), and [Concurrent Work Conventions][concurrent-work]
   (focus-role, swimlane semantics) so the ROADMAP visualization composes with the rest of the
   parallel-work surface.

6. **Migration of existing ROADMAP content.** Existing entries re-classified into horizon tiers;
   stale pointers reconciled or dropped; rendering pass produces the new shape.

### Out of scope

- **Tooling / generation infrastructure.** If "generate ROADMAP from plan-doc metadata" lands
  as the chosen direction, the actual generator is a separate implementation concern — likely a
  later WU.
- **Team-mode portfolio coordination.** Multi-developer portfolio tracking (claim ownership,
  WIP limits across team members) likely belongs with team-coordination strategy work
  post-1.0, not here. This plan stays solo-to-small-team-focused.
- **Project-status / completion-record artifact (`PROJECT-STATUS.md`).** Backward-looking
  artifact; orthogonal to forward-looking ROADMAP form factor.

---

## Sequencing

**Upstream:** No hard prerequisites. Industry-research and tiered-horizon design are
independent of any in-flight WU.

**Soft sequencing:** Likely best landed *after* [Worktree Foundation][wf] and
[Agile WU Lifecycle][awl] have at least drafted PRDs — their actual deliverables (worktree
isolation, tier model, `arc start`) shape what the parallel-work visualization needs to express.
Designing the ROADMAP form factor before knowing those concrete shapes risks over- or
under-engineering.

**Hard sequencing constraint:** Must land before public 1.0 (WU5). The current ROADMAP shape
is a public-facing surface in the docs site; brittle form factor reflects badly on a
methodology framework.

---

## Open Questions

- **Generate vs. hand-maintain near-term tier?** Generating from plan-doc metadata removes
  drift surface but adds tooling complexity. Hand-maintenance with a smaller surface (only
  near-term tier) might be the right balance.
- **Mermaid in markdown — render adequacy?** GitHub renders Mermaid; the docs site will too.
  But the source markdown becomes harder to read directly. Acceptable trade-off?
- **Where does PROJECT-STATUS.md fit?** Currently backward-looking, separate from ROADMAP.
  Should the horizon model unify them, or stay separate?
- **Migration cadence.** Do we re-classify all existing entries in one pass, or transition
  incrementally as WUs ship?

---

[wf]: plan-worktree-foundation.md
[awl]: plan-agile-wu-lifecycle.md
[concurrent-work]: ../feature/plan-concurrent-work-conventions.md
