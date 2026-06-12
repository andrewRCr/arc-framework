# Draft: Decompose Work Unit — Additional Arms

- **Origin:** [internal]
- **Purpose:** Broaden `decompose-work-unit.md` beyond its single symmetric shape (live planning-branch origin →
  fully-retired origin → all-members-newly-minted) to cover the three decomposition cases real practice keeps
  hitting that the workflow has no path for. Each forces a hand-adapted, off-script decomposition today.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **The errand⇄WU wrapper gate is mis-specified as size; it should be character**

- *Routed from:* `arc-plan-conductor` decomposition session (2026-06-12) — design discussion surfaced while
  hand-running this WU's own motivating instance.
- *Observation:* ARC's implicit mapping is `atomic capture → errand`, `multi-step capture → WU` (a clean 1:1). The
  gap is **multi-step work that is still errand-class** — one logical concern, several gated increments, pure
  maintenance. A decomposition like the conductor's is the canonical example: errand-shaped in character, not in
  size.
- *Discriminator (the real axis):* **does the work author/settle design, or relocate already-settled design?** —
  paired with **does it write durable surfaces (code, rules, strategies, methods, workflows) or only movable
  planning artifacts (drafts, metas, stubs, buffers, ROADMAP, inbox)?** A spec earns its keep only when there is
  design to *settle*; a task list only when there is settled design to *decompose into ordered steps*. Pure
  relocation/maintenance has neither — the spec would be empty and the task list would just restate the inbox — so
  it is errand-class **even when multi-increment**. Size / increment-count is not the gate.
- *Why the errand envelope already fits:* chore-branch isolation, no `meta`/`spec`/`tasks`, state derived from
  branch + PR. The only thing that breaks is the word *atomic* in the errand's current definition ("one logical
  concern that fits one review increment"). Decouple "one concern" from "one increment" and the existing primitive
  absorbs this with no new machinery.
- *Invariant that keeps it honest:* a decomposition **relocates** designs to homes and never authors *at* the home
  — a home that needs real authoring is routed *as* a future increment (a new stub, an inbound-buffer note, or a
  spawned atomic errand), so the decomposition stays errand-class even when a destination is a durable surface.
  (Live confirmation: the 2026-06-12 conductor decomposition routed PR-sized boundary estimation *out* as its own
  atomic errand rather than editing `strategy-work-planning.md` inline.)
- *Implication for this WU:* the backlog-stub-source (arm 2) and heterogeneous-home (arm 3) arms **are**
  errand-class decomposition. Consider (a) making `decompose-work-unit` runnable as a multi-increment errand — no
  `meta`/`spec`/`tasks` — and (b) codifying the author-vs-relocate boundary in `strategy-work-organization`
  § Errand Work Class so the wrapper choice is gated on character, not increment-count. This reframes the WU from
  "more decomposition arms" toward "decomposition is an errand-class operation with arms," which may widen scope —
  settle at spec time.

### `[ ]` **Decomposition facilitation: team-ownership motivation + lifecycle-timing axis**

- *Routed from:* `arc-plan-conductor` draft Inbound Buffer (origin: `USER-INBOX § Backlog`, captured during
  `concurrent-work-conventions` planning 2026-06-03), re-homed here at the conductor decomposition (2026-06-12).
- *Concern:* existing decomposition guidance (the conductor's § 11) owns plan-splitting (one draft → several) and
  spec-decomposition (one plan → many WUs) but frames both around *manageability* / *implementation count* only —
  never *ownership distribution* — and its splitting is entirely pre-spec.
- *Proposed:* (1) add splitting motivated by **distributing pieces across distinct single-owner devs** — the direct
  corollary of `concurrent-work-conventions`' "WU = single-owner; cross-person parallelism = decompose into N
  single-owner WUs, not multi-dev-per-WU"; (2) add a **lifecycle-timing axis** — smooth/supported at draft +
  pre-activation stages, with mid-implementation split treated as an explicit costly escape hatch (the inverse of
  the integration-conflict research's "abandon parallelism, redo as unified"). This is the corollary work to the
  errand-gate item above: both are about *what shape* decomposition takes and *when*.

---

## Problem / Motivation

`decompose-work-unit.md` models decomposition as a **single, strictly symmetric** transform:

- the origin must be a **live WU on its `plan/<name>` branch** in `State: Planning`, with a cut-map already in
  hand from `assess-cohort-fit`;
- the origin is **always retired** (`git rm` meta + draft, Step 8);
- **all** members are **newly minted** in `backlog/planned/`, each re-activating via `init-work-unit` Path A.

Three common cases fall outside that shape. All three were hit live during the 2026-06-12 `arc-plan-conductor`
decomposition, which had to be hand-rolled as a bespoke grooming operation precisely because none of them is
supported.

## Scope — the three arms

### 1. Extraction / partial-decomposition arm (origin survives)

There is no arm for the **extraction** case: a live, actively-planned WU sheds one orthogonal sub-concern into a
new sibling while the **origin survives** as a trimmed, still-active WU. Forcing the symmetric flow parks the
origin to backlog and demands immediate re-activation — pure churn — when the author only wants to carve off a
piece and keep going.

- Keep the origin in `active/`; carve the named member(s) to new `backlog/planned/` sibling(s).
- Distribute only the **extracted** draft sections (the conservation / allocation gate, Steps 5–6, runs over
  those, not the whole origin draft).
- Add the origin→member `Depends On` edge.
- **Skip** Step 8 retirement and Steps 10–11 park/teardown.
- Note interaction with the at-cap lateral fan-out arm (the conductor extraction was at-cap).

### 2. Backlog-stub source (decompose without first activating)

The workflow hard-requires a live `plan/<name>` branch + cut-map, so decomposing a WU that lives only as a
`backlog/planned/` stub means first **activating** it (`init-work-unit` Path A → plan branch) only to immediately
decompose it — the exact planning-iteration detour an author decomposing an OBE stub is trying to avoid. Add a
path that decomposes a backlog stub in place (no activation, no plan branch), since the cut for an OBE stub is
often already decided in the capture that flagged it.

### 3. Heterogeneous-home distribution

The symmetric model sends every member to a **newly minted `backlog/planned/` sibling**. Real cuts route to
mixed destinations: a fold into an **existing** artifact (e.g. an existing sibling stub or a `draft-design` block),
an **atomic edit** to a standing doc (e.g. a `strategy-*.md` paragraph), and only *some* parts to new stubs. The
distribution step (and the conservation/allocation gate) must accept these heterogeneous homes, not assume
all-new-members.

## Coordination

- **`composable-workflows`** — already touches the park-exit-block hoist that arms 1–2 reuse; resolve the seam so
  the teardown/park mechanics are shared, not re-implemented.
- **`assess-cohort-fit`** — the cut-map producer. Arm 1 needs a cut-map where one member *is* the surviving
  origin; arm 3 needs cut-map entries that name existing/atomic homes, not just new members.
- The symmetric flow stays the default; these are additional arms, never a silent widening of the existing one.

## Unknowns and Assumptions

- Whether arms 1–3 are one workflow with branching preconditions or warrant separate entry points — settle at
  spec time against the shared park/teardown mechanics.
- The conservation/allocation gate's behavior under partial extraction (arm 1) and atomic-edit homes (arm 3)
  needs explicit definition — it currently assumes the whole origin draft is consumed.

## Scope Estimate

Medium (days-week) — load-bearing workflow design across both package-source and `.arc` copies of
`decompose-work-unit.md`, with arm-interaction analysis and likely touches to `strategy-work-organization.md`
§ Decomposition and `assess-cohort-fit.md`.
