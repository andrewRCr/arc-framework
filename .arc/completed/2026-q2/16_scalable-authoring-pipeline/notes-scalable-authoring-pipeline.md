# Notes: Scalable Authoring Pipeline

> Archive note for the family structural convention applied to the three authoring-stage workflows:
> `draft-design.md`, `1_create-spec.md`, and `2_generate-tasks.md`. The convention surfaces and unifies existing
> structure without changing behavior or renaming the existing numbered workflow files.

## Contents

- [Structural Convention](#structural-convention)
    - [Terminology](#terminology)
    - [Heading Taxonomy](#heading-taxonomy)
    - [Body Envelope](#body-envelope)
    - [Workflow Applications](#workflow-applications)
    - [Scope Boundary](#scope-boundary)
    - [5.R.2 Resolution: `generate-tasks` Depth Spine](#5r2-resolution-generate-tasks-depth-spine)
    - [Cross-Reference Updates](#cross-reference-updates)

## Structural Convention

Bounded by spec § SC15: **no file rename/renumber, no new design**. The convention gives settled behavior a shared
structural home across the three authoring workflows. Re-entry-valve semantics remain the Phase 5 semantics; this
pass only places them inside the loop structure.

### Terminology

The depth-selected alternative block is a **`path`** across the authoring workflow family.
`draft-design` and the SAP spec already used `path` for this meaning ("each level maps to a path — the drafting
procedure at that depth"). Competing terms were retired:

- **`lane`** — removed from workflow prose. Reserved as possible jargon for `composable-workflows`, where a future
  distinction may be useful: `path` as the route an agent runs, `lane` as an extractable parallel block.
- **`(depth) variant`** — retired with `generate-tasks`' inline `**Depth variant:**` marker. The replacement is a
  whole-block path, not an inline sprinkle.

`pass` is **not** a synonym for `path`; it is a distinct taxonomy term for a repeated sweep.

### Heading Taxonomy

The workflow family now uses these categories consistently:

- **Resolve depth & Class** — the entry resolution. One evidence read produces the transient planning-depth level
  and confirms or ratchets `Class`. The heading is identical across all three workflows; the keyed axis lives in
  the body.
- **Step** — a linear sequential action. Flat top-level steps are de-numbered to named sections. Pass-scoped
  sub-steps keep `N.M` numbering where the ordinal encodes local pass grouping.
- **Pass** — a repeated sweep over the same artifact. Used only where the workflow genuinely re-traverses the
  artifact (`generate-tasks`).
- **Path** — a depth-selected whole-block alternative (`low` / `medium` / `high`; `brief` / `outline` /
  `detailed`). Each path encodes its loop-shape choice.
- **Finalize** — the terminal persist-and-commit ceremony. Named rather than numbered.
- **Next Step** — the transition to the next stage.
- **Interlock markers** — embedded gates, never numbered steps.

Only the spine headers are identical key-like anchors across all three workflows: **`Resolve depth & Class`** and
**`Next Step`**. Body sections and terminal ceremonies remain descriptive because they name different
deliverables.

Thin transition sections were folded into their neighboring section or `Next Step` when the standalone heading
only restated behavior owned elsewhere.

Structural consequences:

- `generate-tasks` dropped the `## Process` wrapper so Passes can sit at `##` and pass-scoped steps at `###`,
  matching the family structure.
- `generate-tasks`' former Step 4 became `## Finalize the task list`, outside the Pass numbering.

### Body Envelope

Non-light paths share the same envelope: **Resolve → Setup → Iterate → Finalize → Next Step**.

- **Setup** frames the artifact and seeds the first iteration.
- **Iterate** contains the explicit loop, with an exit condition and a re-entry back-edge.
- **Finalize** persists the artifact and commits the stage output.
- **Next Step** transitions to the following stage.

Two loop flavors are preserved:

- **Convergence loop** — collaborative, open-ended iteration until a readiness bar is met. Used by
  `draft-design` `high` and `create-spec` `detailed`.
- **Sweep loop** — fixed or bounded passes, each producing a review increment. Used by `generate-tasks`.

The re-entry valve is the loop's floor-raising back-edge. When iteration surfaces that the resolved level was too
low, the agent exits and re-enters at Resolve per `resolve-planning-depth` § Mid-stage re-entry. The valve is part
of the loop, not a trailing footnote.

Light paths have no loop: Resolve → confirm → Finalize. The path itself is the loop-shape choice.

### Workflow Applications

- **`draft-design`** — entry heading unified to `Resolve depth & Class`; entry block reduced to method-delegated
  inline stage details; body sections de-numbered; `Capture the draft` kept as the descriptive terminal ceremony;
  re-entry valve framed as the loop's back-edge; `Feed the spec form forward` folded into `Next Step`; `low`
  records `(no draft artifact)`; stray `lane` terms became `path`.
- **`generate-tasks`** — rendered from `2_generate-tasks.template.md` into the `.arc/` copy with `team.mode`
  blocks stripped. Dropped `## Process`; unified entry heading; promoted Passes to `##` and pass-scoped steps to
  `###`; converted the former Step 4 to `## Finalize the task list`; framed the re-entry valve as the back-edge;
  replaced `lane` with `path`; updated citations.
- **`create-spec`** — relabeled the existing sequence without resequencing it: discovery, alignment gates, write
  and iterate, finalize. Unified entry heading, de-numbered body sections, and replaced internal Step references
  with named anchors. Alignment checks remain pre-write gates.

### Scope Boundary

The coherence work handled the shared spine, terminology, depth-path structure, legacy-prose polish, and line
reflow for the authoring workflow family. It did not rename or renumber the existing `1_create-spec.md`,
`2_generate-tasks.md`, or `3_process-task-loop.md` files; that cascade is owned by `doc-cascade-sweep`.

### 5.R.2 Resolution: `generate-tasks` Depth Spine

`generate-tasks` was the only authoring workflow still expressing depth as inline variation. It now uses the
depth spine: `low` / `medium` / `high` blocks under `## Generate in the resolved level` are the execution driver,
and the three former Passes are a shared, depth-agnostic, stopless procedure library:

- `## Structural decomposition`
- `## Content fill`
- `## Grounding audit & coherent revision`

This de-conflates `Pass`: procedure identity is invariant and stopless; a Pass is the review increment that a
path owns by grouping procedures and deciding where inter-pass stops fall. Inter-pass stops live in the paths,
while the grounding audit's per-phase confirm gate stays inside the procedure because it is depth-invariant.

Hardening added during implementation: the paths preamble states that the procedures are reference detail invoked
by the path, not a standalone linear sequence. Each non-terminal procedure carries a depth-agnostic
pass-boundary reminder so an agent cannot skip a review stop that lives in the selected path.

The structural finding was routed to `composable-workflows`: procedure fragments plus thin orchestration
fragments are a second composition shape for the core/fragment boundary.

### Cross-Reference Updates

Heading changes affected a small, concentrated set of references. These were updated as direct consequences of
the structural changes, while filename links remained untouched.

- `generate-tasks` `§ Step 4` → `§ Finalize the task list`: `STRATEGY-INDEX.md`,
  `strategy-task-list-formatting.md`, `template-tasks.md` in both copies, plus
  `analysis-cross-cutting-dependencies.md`.
- `generate-tasks` `Pass 3` → grounding-audit procedure: `arc-task-audit/SKILL.md` in both copies.
- `create-spec` `Step 1` → `§ Resolve depth & Class`: `drain-inbox.md` in both copies.

Filename links elsewhere are heading-agnostic and were left unchanged.
