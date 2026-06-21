# Draft: Decompose Matrix

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). **Absorbs the retired
  `decompose-work-unit-arms`** (its three transform-shape arms + the conservation-gate generalization were folded
  into the origin lifecycle draft this member carries forward).
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Model `decompose` as the full `{parent-position} × {transform-shape}` matrix it is — not the single
  symmetric shape covered today — and ship a `runDecompose` CLI executor over `lifecycle-transition-core`'s
  primitives, with a conservation gate that holds under partial extraction and heterogeneous-home distribution.

> Shared context — the mutator bundle (this member consumes its teardown legs, never `relocate-artifacts`), the
> resolver (cohort-membership reads), and the cohort-level coordination — lives in
> `cohort-lifecycle-state-machine.md`. The whole cohort upstream has **shipped**: `lifecycle-state-resolver`,
> `lifecycle-transition-core` (this member's `Depends On`, now discharged), `planning-pipeline-readiness`,
> `lifecycle-mechanics-tail`, and `errand-lattice` are all in `completed/2026-q2/`. Every contract this member
> consumes shipped **as named** (verified against the code); the remaining work is decompose-specific and is
> scoped below.

---

## Problem / Motivation

`decompose` is a `{parent-position} × {transform-shape}` matrix, but only one transform shape is realized today.
What exists:

- **The workflow's parent-position axis is complete.** `decompose-work-unit.md` already carries all three
  parent-position arms (standalone → top-level cohort, in-cohort → sub-cohort, at-cap → lateral fan-out), the
  four-step conservation gate, the predicted-vs-emergent arm distinction, and the named cohort-scaffold /
  park-exit composition blocks. **Axis 1 is not the gap.**
- **The transition table reserves the `decompose` edges.** `lifecycle-transitions.ts` declares `decompose` as a
  verb with terminal edges (`to: null`, `inverse: null`) for the `provisional`, `planned`, and `planning` source
  positions — the `planning` edge fires the teardown legs (`artifacts: remove`, `reconcileBranch: delete`,
  `reconcileWorktree: teardown`); the `provisional` / `planned` edges fire `artifacts: remove` only (no branch).
  The comment is explicit: *"matrix owned by decompose-matrix."* So the **origin-teardown side of every
  retirement-requiring shape is already encoded at the table level.**
- **`arc stub --cohort` (single member) shipped**; `lifecycle-mechanics-tail` explicitly carved out the
  **batch N-member cohort scaffold** and the **`decompose` workflow rewrite / park-exit teardown migration** as
  *this member's* work.

What is missing — the gap this member closes:

1. **No `runDecompose` verb and no `arc decompose` CLI command.** Only the table edges exist; nothing orchestrates
   them. This is the executor the reserved edges anticipate.
2. **Three of the four transform shapes have no path** — extraction-with-surviving-origin, backlog-stub-source,
   and heterogeneous-home all get hand-rolled (all three hit live during the 2026-06-12 `arc-plan-conductor`
   decomposition). Only the **symmetric** shape (live `plan/<name>` origin, fully retired, all members
   newly-minted) is covered.
3. **The conservation/allocation gate assumes the whole origin draft is consumed**, so it doesn't cover partial
   extraction or atomic-edit homes.

## Resolved model — the full matrix

`decompose` is a `{parent-position} × {transform-shape}` matrix.

### Axis 1 — parent position (one-level nesting cap, ADR-024)

*Realized in the workflow today; carried here for completeness.*

- **standalone → top-level cohort** (name preserved).
- **in-cohort → sub-cohort** under the parent (name preserved).
- **at-cap → lateral fan-out** into sibling WUs under the existing parent (no cohort node; provenance note).

### Axis 2 — transform shape

- **symmetric** (covered today) — live `plan/<name>` origin, cut-map in hand; origin retired (`git rm`), all
  members newly minted in `backlog/planned/`, whole draft distributed. **Table edge:** `decompose@planning`.
- **extraction / origin-survives** — origin **kept** (not retired), sheds one orthogonal sub-concern as a new
  sibling, adds the origin→member `Depends On` edge, distributes only the *extracted* sections, **skips** the
  symmetric retirement. The surviving (thinned) origin takes a **disposition fork**: keep-active (stays in
  `active/`) or park (`park@Planning` relocates it to `backlog/`). **No origin-retire edge fires** (the origin
  isn't retired); the table participation is only the scaffold of the extracted member + the optional park
  composition.
- **backlog-stub source** — decompose a `planned/` stub **in place**, no activation, no `plan/` branch; origin
  retired from backlog, members minted in backlog. **Table edge:** `decompose@planned` (`artifacts: remove`, no
  branch) — already encoded.
- **heterogeneous-home** — members route to **mixed destinations**: a new stub, a fold into an existing artifact
  (sibling stub / `draft-design` block), or an atomic edit to a standing doc. The origin-retire side reuses the
  symmetric or stub-source edge per the origin's position; what is novel is the destination handling
  (fold / atomic-edit) plus the conservation-gate generalization below — orchestration, not a new table edge.

### The mechanical consequence

Across *every* arm the origin is either **retired** (`git rm`) or **kept in place** — **never `git mv`-relocated**.
So `decompose` composes `{retire | keep}(origin) + scaffold×N (or fold / atomic-edit) + distribute-design +
reconcile-branch/worktree(teardown, when a branch existed)`. It is **not** a `relocate-artifacts` caller; it shares
only the **teardown legs** with `park` — confirmed against the shipped table (`decompose` edges use
`artifacts: remove`, never `relocate`). The fan-out (`scaffold × N`, children seeded from the parent's design,
never `git mv`'d — you can't move one source into N destinations) lives in `runDecompose`'s orchestration, *not*
in a single `executeTransition` call.

**"Relocate the origin" is `park` composing on, not a decompose mechanic.** When an extraction's surviving origin
must return to backlog, that is `decompose(extraction) ∘ park@Planning(origin)` — two orthogonal primitives in
sequence, the relocate owned by `park`. `park` shipped with exactly the `park@Planning` (`Planning → Planned`,
relocate to `backlog/planned/`, branch delete, worktree teardown) vs `park@Active` (pointer-record, branch
preserve) split this composition needs, so the workflow may surface the disposition and compose the park (a
`--park-origin`-style convenience) while minting no relocate-the-origin primitive.

### Conservation gate generalizes

The four-step allocation gate (map every section + dependency edge to exactly one destination or
dropped-with-reason; conserve; retire only after green) must hold under **partial extraction** (only the extracted
subset is consumed; the rest stays on the surviving origin) and **atomic-edit homes** (a destination that is a
standing doc, not a member). `assess-cohort-fit`'s cut-map gains two entry kinds it does **not** carry today
(verified against the current method — only `members` / `internal dependency edges` / `deliverable boundaries`
exist): an entry naming the *surviving origin* as a retained member (extraction); entries naming *existing/atomic
homes* (heterogeneous). The method modification is in this member's scope.

## Build scope — full CLI executor, bounded by the mechanics/judgment split

This member **builds the `runDecompose` CLI executor** (Open Question #3, resolved): the reserved table edges, the
shipped teardown legs, the cohort's "deterministic mechanics in the CLI" north star, and `lifecycle-mechanics-tail`'s
explicit carve-out all point the same way. Leaving `decompose` as the lone markdown-orchestrated holdout — when
`runStub` / `runArchive` / `runPark` shipped as verb functions — would violate the cohort's consistency-on-exit
standard.

**"Full executor" is bounded by the cohort's mechanics-vs-judgment line — it does not absorb the judgment:**

- **→ `runDecompose` (mechanics):** the batch **N-member cohort scaffold** (scaffold N member dirs + inherit
  `Origin` / set `Design` / `State` / dual-place `Cohort`), the origin teardown via the reserved table edges, the
  incoming-edge re-point sweep mechanics, ROADMAP regen, the optional `park@Planning(origin)` composition. A
  fan-out orchestration over primitives — *not* a single `executeTransition` edge. The origin teardown
  **reuses the shipped emptied-subdir prune** (`relocate-artifacts`'s `pruneEmptyBacklogSource`) so a retired
  backlog-stub-source origin doesn't orphan its cohort subdir — the `artifacts: remove` leg must prune the same
  way the `relocate` leg already does (the orphan-dir concern itself shipped via `lifecycle-mechanics-tail`; this
  member only *consumes* it, never rebuilds it).
- **→ workflow markdown (judgment, stays put):** the **cut-map** and the **four-step conservation gate** — mapping
  origin sections to destinations is judgment, which the north star deliberately keeps in the workflow. The
  rewritten `decompose-work-unit.md` carries this judgment half and calls `runDecompose` for the mechanics.

**Drained from the inbound buffer (resolved):** the workflow rewrite changes Step 10's commit `Context` footer
from the hook-invalid `(decomposition)` to **`(maintenance)`** — `decomposition` is not in the meta-`*`
parenthetical allowlist (`handoff` / `activation` / `integration` / `archival` / `deactivation` / `maintenance`),
and precedent already used `(maintenance)` for decomposition commits. A dedicated `decomposition` category is
**rejected as out-of-scope**: it would create an asymmetry (`park` / `resume` / `abandon` / `promote` / `demote`
all bucket to `maintenance` too), and completing the ceremony-category set is a separate commit-footer-vocabulary
concern, not this member's.

## Open questions (→ create-spec)

- Whether the four transform shapes are one workflow with branching preconditions or warrant separate entry points
  — settle against the shared park/teardown mechanics (`lifecycle-transition-core`'s bundle + `composable-workflows`'
  park-exit-block hoist).
- The conservation gate's precise behavior under partial extraction and atomic-edit homes (the generalization
  above names the requirement; create-spec settles the exact gate mechanics).
- **Coordination seam with `errand-lattice` (now shipped):** `decompose`'s backlog-stub-source / heterogeneous-home
  arms *are* errand-class (multi-step, pure relocation, no design authored). Whether `decompose` itself runs as a
  multi-increment errand keys on `errand-lattice`'s **character gate** — which now exists and can be consulted
  directly at create-spec, rather than awaited.

### Parked: the facilitation axis (carried from `decompose-work-unit-arms`, evaluate — not committed scope)

The origin lifecycle draft absorbed the three transform arms but left this residual as *"the arms WU's to spec."*
It is held here as a scoped open question, **not committed scope** — by the cohort's consistency-on-exit limit
test it is *un-enhanced, not inconsistent* (the decompose transitions are coherent without it):

- **Mid-implementation (Active-state) decomposition** — the genuinely-novel decompose-domain piece. The shipped
  model treats decomposition as a **Planning-state terminal act** ("a decomposing WU never activates"); decomposing
  a WU with code already written is an uncovered, costly **escape hatch**. The rest of the lifecycle-timing axis
  (decompose at design maturity) is already subsumed by `assess-cohort-fit`'s maturity gate + the predicted/emergent
  arms. **Evaluate at this member's create-spec** whether to absorb the escape-hatch case.
- **Ownership-distribution motivation** — decomposing to distribute pieces across single-owner devs is team-scale
  doctrine owned by `single-owner-wu-model` (a parked `concurrent-work-conventions` member). **Cross-cohort pointer
  only** — not this member's design.

## Dependencies

- **Cohort-internal (discharged):** `Depends On: lifecycle-transition-core` — **shipped**. Consumes its
  mutator-bundle teardown legs (`reconcileBranch:delete` / `reconcileWorktree:teardown`, independently callable),
  the reserved `decompose` table edges, the thin executor's `run<Verb>` extension pattern, and `park@Planning`.
  Reads `lifecycle-state-resolver`'s cohort-membership resolver (`resolveCohortMembers` / `isArchivalTriggered`).
- **Forward-compat:** `composable-workflows` (park-exit-block hoist — still backlog); `assess-cohort-fit` (the
  cut-map producer — this member adds the surviving-origin + existing/atomic-home entries).
- **Shared-surface coordination (`assess-cohort-fit`) — not a merge:** `cohort-cut-coherence` (planned) adds a
  *consistency-on-exit decision rail* to the same method (and/or `strategy-work-organization § Decomposition`), and
  `cross-wu-coordination` names the two as natural neighbors. Distinct concerns — this member adds *cut-map entry
  kinds* (a data-shape change), `cohort-cut-coherence` adds a *decision rail* (a heuristic) — held separate by
  concern-identity, not file-identity. This member is active and lands first, so `cohort-cut-coherence` rebases its
  rail onto the cut-map shape shipped here; no edge gates this member on it.

## Continuity

- **State:** active / `Planning` on `plan/decompose-matrix`; the `lifecycle-transition-core` gate is discharged, so
  nothing blocks create-spec.
- **Readiness:** formalization-ready — the matrix model is settled, the executor scope is resolved to the full CLI
  build (bounded by the mechanics/judgment split), and the inbound buffer is drained. The facilitation-axis
  residual is explicitly a create-spec evaluation, not a fundamental open.
- **Next:** `create-spec` — re-reads the derivation axis at its own entry with this draft as the richest evidence;
  sizes the executor build into increments and settles the remaining open questions.

---
