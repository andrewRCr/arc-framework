# Strategy: Work Planning

**Purpose:** Codify the planning pipeline that takes work from initial idea through to structured
requirements. Covers the full lifecycle: idea → draft documents → specs → task lists, with
conventions for each stage.

**Layer:** Core with arc-in-git extensions. Draft documents, specs, and task lists are Core
artifacts available in all PM modes. The backlog directory structure and the backlog → active transitions
(`provisional → planned → active`) require `pm.mode: arc-in-git`. Sections with arc-in-git-specific
content are marked below.

**Scope:** Planning artifact conventions, discovery guidance, and stage transitions. For backlog
structure and triage, see [Planning Module][planning-module] **(arc-in-git)**. For active work
categories and git workflow, see [Work Organization][work-org]. For task execution, see [Process
Task Loop][process-loop].

---

## Contents

- [The Planning Pipeline](#the-planning-pipeline)
- [Planning Depth](#planning-depth)
- [Draft Documents](#draft-documents)
- [Spec Conventions](#spec-conventions)
- [Layered Specs](#layered-specs)
- [Anti-Patterns](#anti-patterns)

---

## The Planning Pipeline

Work moves through increasing fidelity stages. Each stage has a purpose and an appropriate level of
structure — earlier stages are deliberately lighter than later ones.

```text
Idea                  →  draft-*.md          →  spec-*.md          →  Task list (tasks-*.md)
(problem identified)     (exploration)          (requirements)        (execution)

Fidelity:  Low           Working draft          Structured            Detailed
Structure: Informal      Freeform               Template-based        Workflow-governed
Lifespan:  Transient     Ephemeral (deleted)    Semi-permanent        Active → archived
```

> **arc-in-git mode** adds a structured first stage: backlog items in bucket files
> (`BACKLOG-FEATURE.md`, `BACKLOG-TECHNICAL.md`) that capture and triage ideas before they enter
> the pipeline. See [Planning Module][planning-module] for the full backlog → active model.

**Key principle:** Each stage's documentation should match its fidelity level. Requiring spec-level
structure in a draft is premature formalization. Leaving a spec at draft fidelity is
under-specification.

**Design precedes implementation.** The spec doc (`spec-*`) defines intent; the task list
(`tasks-*`) decomposes execution; the code realizes intent. Design happens upfront in the spec, not
during implementation.

Not every piece of work needs every stage. Small, well-understood work can skip the draft stage and
go directly to a spec. The draft stage exists for work that benefits from exploration before
requirements crystallize.

---

## Planning Depth

The pipeline above is a fixed sequence of stages, but each stage **scales** to the work in front of it. How
much authoring a stage does is its **`planning depth`** — a `low` / `medium` / `high` resolution each stage
settles independently at entry. Depth is transient and per-stage: it is never recorded, and it may differ
across stages (a determinate design over a large surface wants a light spec but a deep task-generation pass; a
tricky algorithm over a small surface wants the reverse). The ordinal, the spec forms it selects, and the
`Class` constraints on those forms are defined in [Work Organization][work-org] § Planning depth and spec
forms; this section codifies **how each stage resolves its depth**.

### One mechanism, read per stage

Every authoring stage resolves depth the same way — one entry-assessment through the
[resolve-planning-depth][resolve-planning-depth] method: a read of the stage's keyed axis against the best
evidence available, with the upstream artifact (when present) the richest input. The stages share one shape and
differ only in **which axis** they read and **what evidence** is at hand:

| Stage            | Keyed axis | Evidence at entry                                                           |
| ---------------- | ---------- | --------------------------------------------------------------------------- |
| `draft-design`   | derivation | the problem framing / origin + a quick compose-vs-invent scan (no upstream) |
| `create-spec`    | derivation | the `draft-*` when present (its shape signals the form), else `Class` alone |
| `generate-tasks` | scale      | the implementation surface read directly — codebase-grounding breadth       |

Because depth is never recorded, there is no value to thread forward — each stage re-derives from evidence.
That same entry read doubles as the stage's [classify-work-unit][classify-work-unit] confirm-or-ratchet
touchpoint: one evidence read drives both the stage's depth and any `Class` update.

### Why the axes are asymmetric

The mechanism is uniform; the **input signal is not**. Drafting and spec creation resolve depth from
**derivation** — how much design must be worked out. Task generation resolves from **scale** — how large and
intricate the implementation surface is. The two axes are independent: a determinate design (low derivation)
can still span a large surface (high scale), and a small surface can still demand an invented design.

That independence has a load-bearing consequence — the **scale axis is feed-forward-immune**. The spec form
recovers the derivation lane for the stages downstream of it (an `outline` tells create-spec's reader that
derivation was moderate), but **no upstream artifact carries scale**: an `outline` spec may front either a light
or a heavy implementation. So task generation cannot inherit its depth from the spec — it reads the work surface
directly at entry, cross-checked against `Class`. The direct read is correct by construction, not a gap:
because depth is never recorded, every stage re-derives regardless.

### The spec stage's depth names a form

Only the spec stage's depth produces a durable artifact — the **spec form**. The derivation depth create-spec
resolves selects it: `low` → `brief`, `medium` → `outline`, `high` → `detailed`. The `detailed` form splits
once more, by the *kind* of derivation that dominates — a **PRD** when the open question is product (*what
should this do*), an **RFC** when it is technical design (*what is the right design, and its tradeoffs*).
`brief` and `outline` are single, category-agnostic forms; only `detailed` splits. The form ↔ `Class`
constraints (`brief` ⇒ `light`; `detailed` ⇒ `heavy` / `novel`; `outline` straddles) are canonical in
[Work Organization][work-org] § Planning depth and spec forms.

### Depth floats; the floor holds

Depth is re-selectable at each stage transition — entry sets a default cascade derived from `Class`, and the
author may resolve a not-yet-started stage lighter or heavier within the band. Two guardrails keep that freedom
honest:

- **A pass may re-fire the read.** When work surfaces that the entry estimate was too low, the
  [resolve-planning-depth][resolve-planning-depth] method fires again mid-stage — capture the signal, ratchet,
  re-enter — rather than patch a too-light artifact onward. The re-entry is axis-keyed: a **scale** signal
  re-enters the same stage higher; a **derivation** signal routes to the stage that owns the design (a masked
  design decision goes back to the spec, not into a deeper task pass).
- **The floor never drops.** Down-switching is bounded by the work's demand floor, and a heavier artifact
  already produced is never torn down — the `Class` ratchet is one-way (see the
  [classify-work-unit][classify-work-unit] method). Per-stage depth floats within the band the floor sets.

---

## Draft Documents

Draft documents (`draft-*.md`) are **freeform exploration artifacts** — working documents where ideas,
research, alternatives, and evolving understanding are captured. They are temporal scratchpads, not
permanent records.

### Purpose

- Explore a problem space before committing to requirements
- Capture research findings, resolved decisions, and approach
- Surface unknowns and alternatives before scope locks in
- Feed into one or more specs when understanding is sufficient

### Convention

**Naming:** `draft-[descriptor].md` — category conveyed by directory placement.

**Location** (depends on [`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git**: `.arc/backlog/{provisional,planned}/<wu-name>/` while incubating; moves to `.arc/active/`
  when a planning branch is initialized (see [`init-work-unit.md`][init-work-unit]) and stays
  there for the duration of the planning session. Disposed at WU activation —
  absorbed path `git rm`s the draft; shelved path moves it back to `backlog/{provisional,planned}/<wu-name>/`.
- **none / external**: `.arc/active/` throughout — drafts are co-located with the specs
  they feed into (no backlog directory).

**Lifecycle:**

- Created when work needs exploration before it can become a spec
- Evolved iteratively as understanding deepens — expect messiness, dead ends, revisions
- Disposed at planning-branch integration — absorbed → `git rm` (the spec captures what matters);
  shelved → moved back to backlog (arc-in-git) or left in active for follow-up (other modes)
- Multiple drafts can feed a single spec (many-to-one), and a single draft can produce multiple specs
  (one-to-many) when exploration reveals natural scope boundaries within the problem space

**What to capture (guidance, not requirements):**

The most valuable things to document during exploration, in rough priority order:

1. **Problem and motivation** — what are we solving and why now?
2. **Alternatives explored** — what else was considered and why was it rejected?
3. **Key unknowns** — what don't we know yet? What assumptions are we making?
4. **Scope estimate** — rough size (small/medium/large or T-shirt sizing)
5. **Dependencies** — what does this depend on or block?

None of these are mandatory sections. Drafts are freeform by design — some will be structured notes,
others will be stream-of-consciousness exploration, others will be mostly research synthesis. The
value is in the thinking, not the format.

**Optional template:** For those who want starting structure, see [template-draft.md][template-draft].
Using the template is optional — many drafts work better as unstructured working documents.

### Planning continuity

Planning is iterative and often spans multiple sessions. The default continuity mechanism is the
planning artifact itself — if a `draft-*` document already exists, resume from that artifact rather
than rediscovering the entire surrounding landscape by default.

On resume, treat the draft as the primary continuity anchor:

- read it first
- identify what appears resolved, stale, and still open
- perform only the additional discovery needed to test stale assumptions or fill concrete gaps

Broad rediscovery is appropriate for fresh planning efforts or when the user explicitly wants a new
landscape pass. When a draft already exists, artifact-first is the safer default for both time and
context budget.

### Supplemental Files

Drafts may be accompanied by supplemental files in the same directory:

- `notes-*.md` — additional analysis, detailed notes
- `research-*.md` — research synthesis (often moved to `reference/supplemental/research/` for archival)
- `design-*.md` — design exploration documents

These follow the same ephemeral convention: delete or archive after the work activates.

---

## Spec Conventions

Specs (`spec-*.md`) are the structured, semi-permanent requirements documents that bridge exploration
and execution. They define *what* and *why*; task lists define *how*. The filename is uniform
(`spec-*`); the spec's **form** varies and is signalled by the H1 — `Spec ({form}): {name}` with the form
backticked, e.g. Spec (`outline`): Payment Retry. There is no single default form; create-spec resolves
it from the work's derivation depth (see [Planning Depth](#planning-depth)).

**The four forms** — one template each, separate rather than one template flexing by conditionals:

| Form | Records | Template |
| --- | --- | --- |
| `brief` | ~1 paragraph: intent + scope boundary + one falsifiable success signal | `template-spec-brief.md` |
| `outline` | ~1-2 pages: Problem, Decision(s), No-gos, Consequences, Success Criteria, Open items | `template-spec-outline.md` |
| `detailed` (PRD) | full product spec: User Stories + prioritized Requirements | `template-spec-detailed-prd.md` |
| `detailed` (RFC) | full technical spec: Proposed Design + Alternatives + Cross-cutting | `template-spec-detailed-rfc.md` |

The `detailed` form carries its subtype in the H1, middot-joined and backticked, e.g.
Spec (`detailed` · `RFC`): Payment Retry. The kebab slug stays in the filename and every cross-reference;
the display name is plain prose, matching the `# Metadata:` / `# Task List:` H1s. For which depth selects
which form and the form ↔ `Class` constraints, see [Work Organization][work-org] § Planning depth and spec
forms.

**Location** (lifecycle position first; `pm.mode` only when nothing is on disk yet — same rule as
[`create-spec`][create-spec] / [`generate-tasks`][generate-tasks]):

- **After planning init** (`active/meta-{name}.md` present): `.arc/active/` — co-located with the meta and
  task list. [Activation][activate-work-unit] is a state-flip + branch rename only; it does not relocate
  these files from backlog.
- **arc-in-git, still incubating** (pre-start stub / `--plan` grooming only):
  `.arc/backlog/{provisional,planned}/<wu-name>/` — uncommon; most specs are authored after init.
- **none / external**: `.arc/active/` throughout.

**Key conventions:**

- **One spec per work unit** — a spec maps to a branch and task list. "I want both a PRD and an RFC" is a
  decomposition signal, not a two-spec work unit; the [layered exception](#layered-specs) is the one
  sanctioned multi-spec shape.
- **Created when work becomes active** — not speculatively during backlog
- **Living document with controlled change** — updated as understanding evolves during
  implementation, but changes should be intentional (not scope creep)
- **Problem-first framing** — lead with why, not what. "Why now" matters as much as "what to build"
- **Validation hangs on Success Criteria** — concrete and falsifiable, present at every form (even the
  `brief` floor's single signal); the task list validates against the form's enumerable substrate. See
  [Work Organization][work-org] § Validation contract.

**Relationship to drafts:** The spec synthesizes and crystallizes what the draft explored. It doesn't
preserve the exploration — it captures the conclusions. The draft is disposed at planning-branch
integration via the absorbed path (`git rm`) once all the specs it feeds are active. One draft may
produce multiple specs when the explored scope splits into distinct work units with different
deliverables, dependencies, or review boundaries.

---

## Layered Specs

The **one-spec-per-work-unit** rule has a single sanctioned exception: a team with a genuine product /
engineering role split may author a complementary **PRD and RFC** for the same work unit — the product
requirements and the technical design as two documents with two distinct authors.

This is an opt-in, non-default pattern. A developer-agent pair normally holds both roles in one loop, so a
single spec keyed to the dominant derivation-kind is the default; reach for layering only when two distinct
authors genuinely own the two halves.

**Convention when layering:**

- **Two files, slug-paired:** `spec-{name}-prd.md` + `spec-{name}-rfc.md`. The meta `**Design:**` field
  references both (one bullet, comma-separated, each backticked — the same multi-value shape as
  `**Depends On:**`).
- **No overlap:** the PRD owns the shared context spine (Introduction / Goals / Non-Goals); the RFC goes
  **referential**, dropping that spine and pointing at the PRD. Each keeps its own Success Criteria and Open
  items — a design's checks and questions differ from the product's.
- **No machinery:** layering adds no config knob and no workflow fork. It is a naming convention plus the
  multi-value `Design` affordance — nothing more.

---

## Anti-Patterns

**Over-codifying exploration.** Draft documents should be freeform. Requiring templates, mandatory
sections, or approval gates on working documents constrains creative thinking and adds ceremony
without proportional value.

**Premature formalization.** Writing a spec before the problem is understood leads to requirements
that change constantly or miss the actual need. Invest in exploration first.

**Kitchen-sink specs.** Specs that try to be both requirements and implementation detail. Requirements
define *what* and *why*; implementation details belong in task planning.

**Zombie drafts.** Draft documents that persist past planning-branch integration. The absorbed path
disposes them via `git rm` once the spec is the authoritative artifact; leaving them around will only
cause confusion alongside the spec they fed.

**Skipping discovery.** Jumping from "I have an idea" to "here are the requirements" without asking
the hard questions about scope, alternatives, and risks. The draft stage exists to surface them while
course-correction is still cheap.

---

## Related Documentation

- [Planning Module][planning-module] — Backlog structure, triage flow, atomic tasks **(arc-in-git)**
- [Work Organization][work-org] — Work categories, branching model, directory structure
- [Draft Design Workflow][draft-design] — Design-shaping stage upstream of the spec
- [Create Spec Workflow][create-spec] — Step-by-step spec creation process
- [Draft Template][template-draft] — Optional draft document structure
- [ADR Methodology][adr-methodology] — Comparable lifecycle for architectural decisions
- [Process Task Loop][process-loop] — Task execution workflow (downstream of the spec)

---

[planning-module]: strategy-planning-module.md
[work-org]: strategy-work-organization.md
[init-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md
[draft-design]: ../../../system/workflows/arc/draft-design.md
[create-spec]: ../../../system/workflows/arc/create-spec.md
[generate-tasks]: ../../../system/workflows/arc/generate-tasks.md
[activate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/activate-work-unit.md
[resolve-planning-depth]: ../../../system/methods/resolve-planning-depth.md
[classify-work-unit]: ../../../system/methods/classify-work-unit.md
[template-draft]: ../../templates/arc/work-unit/template-draft.md
[adr-methodology]: strategy-adr-methodology.md
[process-loop]: ../../../system/workflows/arc/process-task-loop.md
[arc-config]: ../../../system/arc-config.yml
