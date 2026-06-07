---
name: resolve-planning-depth
description: Resolve a stage's transient planning-depth level from one keyed-axis read against best-available evidence.
override-active: false
---

# Method: resolve-planning-depth

> - **Workflow:** [draft-design.md][draft-design]
> - **When:** A planning stage performs its single entry-assessment — the one evidence read that opens the stage.
>
> - **Contract:** Given the stage's keyed axis and the best available evidence, resolve the **planning-depth
>   level** — `low` / `medium` / `high`. The level is transient, per-stage, and never recorded; it sets the
>   stage's depth and is re-derived from evidence at each stage rather than threaded forward. Run **paired with —
>   not merged into** — [classify-work-unit][classify-work-unit]: one evidence read drives both, this method
>   yielding the transient depth and `classify-work-unit` the recorded `Class`.

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

---

[draft-design]: ../workflows/arc/draft-design.md
[classify-work-unit]: classify-work-unit.md
