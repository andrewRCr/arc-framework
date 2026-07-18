---
name: assess-parallel-fit
description: Advisory parallelize-vs-serialize-or-coordinate judgment over a candidate WU's fit against in-flight work
override-active: false
---

# Method: assess-parallel-fit

> - **Workflow:** [in-flight-scope-check.md][in-flight-scope-check], [activate-work-unit.md][activate-work-unit],
>   [run-errand.md][run-errand], [session-init.md][session-init]
> - **When:** A candidate is weighed against the in-flight work set — when a new WU is about to start (cold-start /
>   spawn, via the in-flight scope check), at the Planning→Active flip, at the errand surface where `arc errand
>   check` already emits overlap facts, and at the pick-time / next-work-discovery subset selection.
>
> - **Contract:** Given a candidate WU (or candidate set) and the in-flight work set, return an **advisory
>   posture** from the overlap read — **proceed** / **flag and consider sequencing** / **coordinate** — and, when
>   the in-flight composition is salient, a neutral **design-load note** (informational, never posture-moving).
>   The read is advisory, never gating: the integration-time behind-base check is the real net. This method is the
>   single invocable home for the judgment; the consuming hosts and the doctrine strategy reference it rather than
>   restating the rubric.

## assess-parallel-fit.override

[No override configured]

## assess-parallel-fit.default

Two reads, one posture. The **overlap read** sets the posture — **proceed** / **flag and consider sequencing** /
**coordinate** — scaled to the evidence the candidate has; it is the method's verdict. The **design-load read** is
a separate, lighter signal: when the in-flight composition is worth noting it adds one neutral, informational line,
and it never changes the posture. Overlap is the firm read; design-load is context for the operator's own call.
**Read only what your surface needs** — see the routing below.

### Per-surface routing

The reads are cumulative — read the sections your surface needs, then stop. Whether the design-load read applies
turns on one question: **is the candidate's own design still open?**

- **Errand launch** (`run-errand`, warm or cold) — **overlap read only** (§ The overlap rubric through
  § Proportionality guard). Consume the overlap facts `arc errand check` already emits and apply the rubric and the
  all-owner gate (foreign-owned → coordinate) to the errand's diff. An errand is atomic, has no design stage, and
  adds no design load — stop before § Design-load read.
- **Planning→Active flip** (`activate-work-unit`) — **overlap read only**, the same prefix. The activating WU's
  design is settled at the flip, so the design-load read self-quiets; the value is re-checking overlap, which may
  have drifted since the WU was first scoped — a flag here can warrant parking it until the colliding WU integrates.
- **New-WU start** (cold-start / spawn, via the in-flight scope check) and **pick-time / next-work discovery** —
  **both reads.** The candidate's design is still ahead of it, so the design-load read applies; pick-time continues
  through § Multi-candidate selection (the subset-selection form).

### The overlap rubric

Read the candidate's domain against the in-flight set and map the overlap to a posture:

- **Disjoint domain → proceed.** No shared surface with any in-flight WU — parallelize freely.
- **Shared module / strategy / load-bearing infra → flag and consider sequencing.** The candidate and an in-flight
  WU touch the same code or document surface, or a shared piece of load-bearing infrastructure. The work can still
  proceed, but the overlap is a real integration cost — weigh sequencing the two over running them at once.
- **Foreign-owned overlap → coordinate.** The overlapping surface belongs to another owner's in-flight WU (see
  § Self/foreign asymmetry). Resolve the contention with that owner before proceeding — you cannot unilaterally
  reorder work you don't own.

### Evidence-tiering ladder

Scale the depth of the read to availability × stakes. Never "Purpose only," and never a heavyweight evaluation of
every candidate — climb a tier only when the cheaper read leaves the call unresolved.

- **Tier 1 — always.** Read the candidate's `**Purpose:**` and meta scope fields. This is the coarse baseline; for
  a bare Ready stub it is all there is, so the read leans conservative — thin input resolves toward flag or
  coordinate, not a false-confident proceed.
- **Tier 2 — escalate.** When the Tier-1 read is ambiguous or flags possible overlap, read the candidate's richest
  authored artifact — `draft-*` when present, else `spec-*`. "Richest the candidate has" is lifecycle-relative: a
  Ready stub has neither; a spec'd WU has its spec.
- **Tier 3 — cohort siblings.** When the candidate and an in-flight WU share a cohort, consult the `cohort-*` file
  first — its dependency edges and Shared-contracts section are purpose-built coordination, the primary and most
  authoritative input for intra-cohort parallelism. A cut-designed-disjoint partition is a strong "safe"; a
  declared shared contract or a `Depends On` edge is the explicit serialize-or-coordinate signal.

### Self/foreign asymmetry

Every WU is single-owner, so overlap on a shared surface reduces to one question — whose WU owns it:

- **Self-overlap → reorder freely.** The candidate overlaps your own in-flight WU. You own both, so sequence them
  in whatever order suits; there is no coordination cost beyond your own attention.
- **Foreign-overlap → coordinate.** The overlapping WU belongs to another owner. Resolve the contention with that
  owner before proceeding — you cannot unilaterally reorder work you don't own.

In a single-owner-per-WU model this asymmetry is the whole judgment on a shared surface: the rubric's "shared" and
"foreign-owned" rows are the same overlap read through the owner lens.

### Proportionality guard

The overlap read is advisory — it sets the posture but **never hard-blocks**. The integration-time behind-base
check is the real safety net; the read only saves an avoidable rebase, so keep it proportionate to that stake.
Default to the light read (Tier 1) and deepen only on a flag worth resolving before committing to parallel. Never
run a pre-emptive heavyweight conflict-evaluation of every candidate — exhaustive overlap prediction is the
rejected posture, not the bar here.

### Design-load read · activation & pick-time only

A second read, **informational and never posture-moving** — it surfaces the shape of design effort already in
flight so the operator can weigh attention, not so the method can tell them to take on less. The scarce resource is
**concurrent unsettled design**: execution and scale load are bounded and chunked (a settled plan, the per-task
review grain), but holding more than one open, not-yet-settled design at once is what saturates.

Two cheap inputs — the meta `**State:**` and whether a complete spec/tasks exist; no artifact deep-read:

- **Magnitude, from `Class`.** `Novel` → **high** (invention is open derivation by definition); `Heavy` →
  **moderate** (derivation may be the driver — the honest hedge, since `Class` doesn't record which axis fired);
  everything else → quiet.
- **Design-settled gate.** A WU draws on the budget only while its design is still **open**. A candidate counts at
  full magnitude — its planning is almost always ahead of it, done in-flight before activation — while an
  already-in-flight WU discounts to quiet once its design is **settled**: its spec is finalized, whether it is
  parked there or advancing through task generation, execution, or `Integrating`. Pre-spec planning and bare-stub
  work are open. The gate is binary but the load is not: design effort front-loads into the early planning stages
  (drafting heaviest, spec formalization lighter), so weigh a WU late in an open planning arc below one just
  opening its draft (the decay informs that weighing only; the salience count below stays binary).

**Salience — signal, not noise.** After adding the candidate, count the design-open `Novel` / `Heavy` WUs. Surface
a note only when that reaches **2+** (two unsettled derivations at once — the saturation case), or as a soft
backstop when the active count runs past the modest-concurrency posture (~3+). Below that, stay silent.

**Phrasing — describe the board, don't judge the operator.** State the composition as fact ("this would be the
second design-open `Novel` in flight; both still need their design worked"), never as a verdict on capacity ("take
on less," "defer this"). The operator owns the call — the note only makes the board legible.

### Multi-candidate selection · pick-time only

At the pick-time / next-work surface the judgment is a subset selection over several Ready candidates, not a single
go/no-go — both reads apply. From the **overlap** read: prefer disjoint-domain picks, and don't stack two
same-module candidates (that reintroduces the collision cost). From the **design-load** read: the
modest-concurrency posture (≈2–3 active) is the soft WIP cap, and selecting two design-open `Novel` / `Heavy`
candidates at once is the same 2+-unsettled-design note surfacing here — informational, the operator's call.

---

[in-flight-scope-check]: ../workflows/arc/work-unit-lifecycle/in-flight-scope-check.md
[activate-work-unit]: ../workflows/arc/work-unit-lifecycle/activate-work-unit.md
[run-errand]: ../workflows/arc/supplemental/run-errand.md
[session-init]: ../workflows/arc/session-lifecycle/session-init.md
