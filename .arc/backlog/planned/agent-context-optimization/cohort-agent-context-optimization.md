# Cohort: `agent-context-optimization`

> _Coordination and identity record for this cohort. Membership is derived from each member's
> `Cohort` field — held here as shared coordination, never a roster. Internal-dev; not shipped._

**Parent:** [none]

**Purpose:** The work units that bound ARC's runtime instruction surface. The shared thesis is a reading
test: **every line an agent reads at runtime should either (a) change behavior this session, or (b) be the
bounded cost of discovering it doesn't.** Its determinism corollary is a chain: if the CLI can compute it,
the CLI computes it; if the CLI computed it, no document restates it; if it's conditional, it doesn't load
until its condition is true. The structural consequence members build toward: **a new probe surface or
conditional arm adds O(1) to any always-read core** — new behavior lands as CLI slots and fragments, never
as core lines. Discipline never scales down; what scales down is what a session must read to act correctly.

---

## Layers model

Members partition by ceremony surface, but the work partitions by layer. Each member's identity is stated
against the layers it serves:

- **L1 — Compiler** (CLI computes; the envelope carries results, not raw state): probe → agenda emission,
  precomposed rendering text, delta slots, structured-trigger evaluation. Served by `handoff-optimization`'s
  CLI items and `instruction-optimization`'s envelope-extension batch.
- **L2 — Composition substrate** (fragments exist; loading is resolve-then-load): the fragment model,
  loading mechanics, stable anchors, index hubs, the session-agenda schema. Owned by `composable-workflows`
  — the cohort keystone.
- **L3 — Load-set policy** (what earns always-loaded): the recognition-reliability demotion rule and the T1
  manifest audit. Owned by `loadset-composition`.
- **L4 — Authoring discipline** (the pattern humans write to): the signature-led workflow contract shape —
  frontmatter contract, bounded spine, gated fragment pointers, schema out-of-band, emitted text
  precomposed. Codified by `composable-workflows` into the workflow-authoring strategy; applied across the
  remaining corpus by `instruction-optimization`.

## Sequencing

- **`composable-workflows` design settles first.** Every other member consumes its pattern (L4) or its
  mechanism (L2). Settling means the fragment model, agenda schema, and contract shape are decided — not
  that its implementation ships before siblings start.
- **`loadset-composition` runs early.** Its decision rule and manifest audit are CW-independent, and it
  sequences ahead of `arc-plan-conductor` (loop-canon consumer). Its process-task-loop split executes
  against CW's settled pattern.
- **`handoff-optimization`'s CLI items are opportunistic** — no CW dependency; slot in anytime. Its
  lightweight-path items consume CW fragments and wait for the design to settle.
- **`instruction-optimization` is the execution tail** — depends on CW; its D3.4 rendering slot
  soft-coordinates with `handoff-optimization`'s `recommendedSummaryLine` helper.

## Rename decision

The cohort renames `agent-context-optimization` → `instruction-discipline` at the first member's planning
kickoff — a single batch rename (directory, member `Cohort` fields, this doc, ROADMAP). Recorded here as
the authoritative decision; member drafts reference it rather than restating it.

## Boundary: `documentation-surface-routing`

A member by `Cohort` field, but its concern — content routing across record surfaces (commit bodies,
completion notes, pointers) — is orthogonal to instruction loading. It consumes the L4 pattern for its
salience-at-compose-time mechanism and is otherwise not re-anchored by this cohort's shared thesis.

---
