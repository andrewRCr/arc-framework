---
name: resolve-planning-depth
description: Resolve a stage's transient planning-depth level from one keyed-axis read against best-available evidence.
override-active: false
---

# Method: resolve-planning-depth

> - **Workflow:** [draft-design.md][draft-design], [1_create-spec.md][create-spec],
>   [2_generate-tasks.md][generate-tasks]
> - **When:** A planning stage performs its entry-assessment — the one evidence read that opens the stage — or
>   re-fires that read mid-stage at an interlock when a floor-raising signal surfaces (the re-entry valve).
>
> - **Contract:** Given the stage's keyed axis and the best available evidence, resolve the **planning-depth
>   level** — `low` / `medium` / `high`. The level is transient, per-stage, and never recorded; it sets the
>   stage's depth and is re-derived from evidence at each stage rather than threaded forward — and re-fired
>   mid-stage when a floor-raising signal surfaces (§ Mid-stage re-entry). Run **paired with — not merged into** —
>   [classify-work-unit][classify-work-unit]: one evidence read drives both, this method yielding the transient
>   depth and `classify-work-unit` the recorded `Class`.

## resolve-planning-depth.override

[No override configured]

## resolve-planning-depth.default

One read, one level. Each planning stage reads **one keyed axis** against the best evidence it has and resolves
the planning-depth level from it. The shape is shared across the stages; the axis and the evidence differ.

### The level

A stage's level is a measurement against the standing `Class` estimate — the same read that confirms-or-ratchets
`Class`, so the touchpoint falls out of estimate-then-ratchet with no circularity (one evidence read, two
outputs). What the level sets is the stage's authoring **distance**, never the spec-ready bar's **height**:
every level clears the same bar (all settle-able design settled), reached at a different cost.

- **`low`** — the keyed axis is determinate or small: the stage's output reads off the problem and existing
  patterns, with little to author or map.
- **`medium`** — a bounded middle: a contained set of decisions to compose, or a moderate surface to map.
- **`high`** — open-ended or substantial: a real design to author (or invent), or a large, intricate surface to
  ground.

### Per-stage axis rows

Each stage keys the read to the axis its output is most sensitive to. The two derivation stages recover their
axis from an upstream artifact when one is present; the scale stage cannot — scale is carried by no upstream
artifact — so it reads the work surface directly.

- **`draft-design`** (derivation) — the problem framing / origin plus a compose-vs-invent scan; no upstream
  artifact, since the stage is the headwater.
- **`create-spec`** (derivation) — the `draft-*` when present (its produced shape is the richest signal), else
  `Class` plus a direct problem read; narrows to a brief-vs-outline disambiguation.
- **`generate-tasks`** (scale) — the implementation surface read directly (codebase-grounding breadth),
  cross-checked against `Class`. Feed-forward-immune: no upstream artifact carries scale.

Structural design is settled; only the **thresholds** — what breadth reads `high`, how many open decisions read
`medium` — calibrate against real use.

### Depth band & guardrails

A stage's level is a **choice within a band**, not a lock: entry sets a default cascade derived from `Class`, and
the author may re-select it per stage at each transition — a `light` WU can still warrant a careful pass over one
tricky stage. Depth is the per-context default, never a `Class`-lock. Two guardrails bound the float:

- **Down-switch floor.** Down-switching is bounded by the **demand floor** — never below the forced
  derivation / scale floor the stage's axis requires. That floor is the realized `Class` floor, which only
  ratchets up (per [classify-work-unit][classify-work-unit] § Estimate-vs-realized ratchet); depth floats freely
  above it.
- **No-demotion.** The choice is forward — how much to author going into a **not-yet-started** stage. A heavier
  artifact **already produced** is never torn down to match a lighter later pick; re-selection lowers the next
  stage's effort, never un-authors a settled one.

### Mid-stage re-entry (the re-entry valve)

The same keyed-axis read, fired **on demand at a stage's existing interlock** rather than only at entry. A
resolved level is never a one-shot commitment: any pass may surface that the estimate was too low — a masked
design decision, or a scale surface wider than the level assumed. The response to such a **floor-raising signal**
is **capture (durably) → ratchet → re-enter**, never patch-and-limp a too-light artifact over it. The valve is
**offered with a recommendation at the interlock, never a new automatic detector** — accept-or-decline, like
every other depth read.

On accept, re-fire the keyed-axis read and route by the axis the signal belongs to. The rule is one line: **route
to the stage that owns the signal's axis, re-entered one level higher.** Scale is owned by `generate-tasks`;
derivation by the design stages (`draft-design` / `create-spec`).

- **Already in the owning stage (or the headwater)** → re-enter *this* stage higher, **nowhere-up from `high`**. A
  scale signal at `generate-tasks` re-resolves `generate-tasks`; `draft-design` is the derivation headwater, so it
  only re-enters itself.
- **Owning stage is upstream** → route there. A derivation signal at `generate-tasks` routes to the **spec** (a
  masked design decision belongs in the design, not a deeper task pass); a derivation signal at `create-spec`
  whose *direction* is unshaped routes to `draft-design`, while a merely-underestimated *form* re-resolves
  `create-spec` higher.

The re-entry read is a `classify-work-unit` confirm-or-ratchet exactly as the entry read is: a floor-raising
signal ratchets `Class` **up** to the realized floor (scale → `Heavy`; derivation → `Heavy` / `Novel`),
coordinating with [classify-work-unit][classify-work-unit]. Like the entry read, this ratchet is **decision-live
but persistence-deferred**: it drives the (re-)entered stage's depth immediately, but the `**Class:**` write
defers to that stage's planning-ceremony commit, never a mid-stage meta edit — honoring meta-timing's
no-mid-session-churn rule.

**Re-entry vs. in-place correction.** Re-entry is for an *unshaped or under-derived* design direction — the
owning stage must be re-entered to author it at the right depth. A *local* correction — a named mechanism, shape,
or interface that is merely wrong — is propagated to the spec in place without re-entering the stage (the
in-place sibling is `generate-tasks`'s grounding-audit spec-propagation). The cut is whether new design must be
*authored* (re-enter) or an existing decision *corrected* (propagate).

---

[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/1_create-spec.md
[generate-tasks]: ../workflows/arc/2_generate-tasks.md
[classify-work-unit]: classify-work-unit.md
