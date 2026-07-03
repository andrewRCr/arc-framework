# Strategy: Knowledge Evolution (project-internal)

> **This is the knowledge-layer forward-compatibility CHECK-DOC.** Before building anything that places,
> names, indexes, or loads agent-facing guidance content, **run the
> [Self-Check](#self-check-run-this-before-building) below** and confirm the design composes with the
> unified knowledge model. The target itself is `draft-knowledge-architecture.md` (north star); this doc
> is the interim discipline that points at it.
>
> **Status:** In-development reference — architectural *direction*, not a description of what ARC is
> today. Projected from the north-star draft's settled principles (grooming through 2026-07-03); updated
> whenever a grooming pass there settles or revises a principle. *Naming note:* this doc family's own
> name ("strategy") is among the things the target model redesigns; the file follows the current live
> convention until that lands.

**Purpose:** Forward-compat discipline for ARC's non-procedural knowledge layer (strategies, rules,
briefs, reference/index surfaces). Defines the placement and awareness principles ARC is evolving toward,
so near-term WUs don't accrete guidance-placement, naming, or loading choices a later migration must undo.

**Scope:** Guidance-content placement, trigger/index/description surfaces, loading and awareness
mechanisms, doc-family naming, always-loaded-context growth.

**Why project-internal:** Adopter-facing strategies in `strategies/arc/` describe what ARC IS. This
describes direction for ARC's own evolution — for plan / PRD authors in this repo, not for adopters
configuring ARC.

---

## Self-Check: run this before building

Consult this doc when authoring or iterating any plan / PRD / WU that touches:

- **Placement of guidance content** — adding, relocating, or restructuring strategies, rules, briefs,
  reference docs, or any agent-facing "consult this" content.
- **Always-loaded context** — anything growing session-init's load set or an always-loaded surface.
- **Trigger, index, or description surfaces** — index entries, skill descriptions, "consult when" lines,
  frontmatter declarations that cause loading.
- **Loading / awareness mechanisms** — new machinery for getting content into an agent's context, or new
  frontmatter keys that affect loading.
- **Doc-family naming or classification** — new artifact families, renames, frontmatter `type` values.

**The question for each:** *does this design compose with the unified knowledge model as the future
shape, or does it lock in placement, naming, or loading choices that model would have to undo?* If the
latter, surface the tension explicitly during authoring rather than deferring it.

---

## The Target Model (in brief)

Placement follows **miss-cost × trigger-knowability**: high-miss-cost content (constraints) is
always-loaded or gate-site placed; structurally-triggerable content loads at mechanically-evaluated fire
sites; genuinely emergent-relevance content lives behind a directive firing-condition index. "Strategy"
as a category dissolves into four content kinds — (A) operational reference → fire-site triggers,
(B) hard constraints → always/gate-site, (C) explanation/rationale → location-variable (docs site or
labeled in-repo surface), (D) emergent-relevance doctrine → firing-condition index. Knowledge units are
the public-knowledge counterpart of methods (two axes: procedure vs knowledge × private vs public), with
access paths *derived* from structure rather than declared. Full model: `draft-knowledge-architecture.md`.

---

## Forward-Compat Principles

Discipline that keeps interim work composing toward the target without locking in conflicting choices.

### 1. Place by miss-cost; constraints never go on-demand

A hard invariant (safety rule, non-negotiable, destructive-operation guard) belongs in an always-loaded
rules surface or at the fire site gating the operation it protects — never mid-document in an on-demand
file, never index-only. When a plan adds a constraint, place it where its operation fires.
**Anti-pattern:** burying a new invariant in a strategy section because the strategy "owns the domain."

### 2. Author trigger surfaces as directive firing conditions

Any entry whose job is to cause loading or invocation — index lines, skill descriptions, "consult when"
lines — names its trigger *and* the default behavior to suppress ("ALWAYS load/do X when {trigger}; do
not {default action} directly"), never a title or passive summary. Passive descriptions are the
measured weakest-firing style.

### 3. Anchor triggers to operations, not workflows

A workflow is a *site where an operation occurs*, not the operation itself. Condition on "rendering
ROADMAP" or "routing discovered work" — operation-anchored triggers cover ad-hoc invocation for free;
workflow-anchored ones silently miss it.

### 4. Access paths are derived — no new tier or loading flags

Whether content is fire-site-loaded, index-present, or always-loaded derives from structure (a consumer
declares it; it carries a fire line; it is in the loadSet manifest). Don't introduce per-artifact
`tier`/loading fields or booleans — that is declared state the model computes.

### 5. Generalize the methods mechanism; declare at point of use

New on-demand loading wants an `arc.methods`-style fire-site declaration, not bespoke machinery or prose
instructions. Each artifact declares only what its *own body* consumes (a workflow never re-declares its
methods' dependencies); resolution is a deduped transitive closure the CLI can compute.

### 6. Extract on fan-in, not aesthetics

Don't extract shared guidance into a standalone unit before a second consumer (or an orthogonal surface
need — projection/audience, lint target) forces it. Single-consumer content stays inline in its owner.

### 7. Prefer emitted remedies over loaded documents for command awareness

The sharpest trigger for a command is the symptom it fixes: put the fix invocation in the failing gate /
hook / CLI output. Command reference is fire-line-sized capability cards, not documents needing a
loading tier. Don't design new "command reference doc" surfaces.

### 8. Author for humans, address for agents

Keep knowledge content coherently human-readable; fragmenting is an *addressing* concern (stable
anchors, section-level reads), not necessarily a *storage* concern. Don't blind-shard documents into
agent-sized chunks.

### 9. Stay projection-compatible

Knowledge is heading toward authored-once, projected to in-repo agent-native and external team-facing
surfaces (composes with `strategy-storage-evolution.md` Principle 2's record/projection line). Don't
bake in "this file is the only surface" assumptions; audience-tag new knowledge content where the
distinction exists (team vs agent).

### 10. Don't grow the always-loaded set casually

Instruction-following degrades measurably with instruction count; the `always` tier stays minimal.
Demotion from always-loaded goes only to an *explicit trigger*, and constraints are never demoted
(the `loadset-composition` rule). New always-loaded content earns its slot against the budget.

---

## Relationship to Other Documents

- **`draft-knowledge-architecture.md`** — the north-star target: full model (placement principle,
  four-kind verdict, boundary axes, awareness-contract schema, derived access paths, command-reference
  cards, projection direction), research grounding, corpus findings, sibling seams.
- **`draft-loadset-composition.md`** — owns the T1 boundary and demotion rule Principle 10 restates;
  whichever WU runs first, the other re-anchors.
- **`draft-rules-restructure.md`** — domain-rules wiring; constraint-relocation execution seam
  (Principle 1's relocation list is authored by knowledge-architecture, execution negotiated there).
- **`draft-composable-workflows.md`** — the fragment/addressing substrate Principles 5 and 8 compose
  with.
- **[`strategy-storage-evolution.md`](strategy-storage-evolution.md)** — sibling check-doc (same
  interim-discipline shape); its record/projection and tracked-vs-materialized principles are what
  Principle 9 composes with.
- **`draft-skill-infrastructure-cleanup.md`** — the skill-side rewrite pass consuming Principle 2's
  firing-condition authoring standard.
