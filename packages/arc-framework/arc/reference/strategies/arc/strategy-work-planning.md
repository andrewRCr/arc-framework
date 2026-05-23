# Strategy: Work Planning

**Purpose:** Codify the planning pipeline that takes work from initial idea through to structured
requirements. Covers the full lifecycle: idea → draft documents → specs → task lists, with
conventions for each stage.

**Layer:** Core with arc-in-git extensions. Draft documents, specs, task lists, and the discovery
checklist are Core artifacts available in all PM modes. The backlog directory structure and
graduation pipeline (backlog → active transitions) require `pm.mode: arc-in-git`. Sections with
arc-in-git-specific content are marked below.

**Scope:** Planning artifact conventions, discovery guidance, and stage transitions. For backlog
structure and triage, see [Planning Module][planning-module] **(arc-in-git)**. For active work
categories and git workflow, see [Work Organization][work-org]. For task execution, see [Process
Task Loop][process-loop].

---

## Contents

- [The Planning Pipeline](#the-planning-pipeline)
- [Draft Documents](#draft-documents)
- [Discovery Checklist](#discovery-checklist)
- [Spec Readiness](#spec-readiness)
- [Spec Conventions](#spec-conventions)
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
> the pipeline. See [Planning Module][planning-module] for the full graduation model.

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
  graduated path `git rm`s the draft; shelved path moves it back to `backlog/{provisional,planned}/<wu-name>/`.
- **none / external**: `.arc/active/` throughout — drafts are co-located with the specs
  they feed into (no backlog directory).

**Lifecycle:**

- Created when work needs exploration before it can become a spec
- Evolved iteratively as understanding deepens — expect messiness, dead ends, revisions
- Disposed at planning-branch integration — graduated → `git rm` (the spec captures what matters);
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

These follow the same ephemeral convention: delete or archive after the work graduates.

---

## Discovery Checklist

Before a draft is "ready" to become a spec, these questions should be addressed. This is guidance, not
a gate — not every question applies to every piece of work, and some answers may be "not applicable"
or "we'll figure this out during implementation."

The purpose is to prevent shallow scoping by ensuring the important questions get asked early, when
course-correction is cheap.

1. **What problem are we solving?** Frame as a problem, not a solution.
2. **Why now?** What makes this worth doing at this point?
3. **What alternatives exist?** At least consider one other approach, even briefly.
4. **What could cause this to fail?** Risks, dependencies, unknowns.
5. **What are we explicitly not doing?** Scope boundaries prevent creep.
6. **What assumptions are we making?** Which are validated, which are risky?
7. **What's the minimum viable version?** The smallest useful increment.

**For AI agents:** Treat these as prompts for discovery questions to ask the human before drafting
requirements. Revisit them iteratively as the conversation develops — especially where ambiguity,
assumptions, or trade-offs appear. Better discovery produces better specs — resist the pull to
generate output before understanding the problem.

---

## Spec Readiness

Lightweight signals that a draft has matured enough to become a spec. These are indicators, not a
formal approval gate.

**The draft is likely ready when:**

- The problem and motivation are clear to someone who wasn't involved in exploration
- At least one alternative approach was considered (even if briefly)
- Key unknowns are identified (not necessarily resolved — but known)
- Scope is bounded enough to write requirements against
- Major dependencies are identified

**The draft is likely not ready when:**

- The problem statement keeps shifting
- No alternatives were explored (first idea accepted without question)
- Fundamental unknowns remain that could change the entire approach
- Scope is unbounded or growing with each discussion

**When ready:** Create the spec using the [create-spec workflow][create-spec] and a spec template (the
[PRD template][template-prd] is the default form). The draft is disposed at planning-branch
integration — graduated path `git rm`s it (the spec captures what matters); shelved path moves it back
to backlog when exploration ended without producing an active WU.

---

## Spec Conventions

Specs (`spec-*.md`) are the structured, semi-permanent requirements documents that bridge exploration
and execution. They define _what_ and _why_; task lists define _how_. The filename is uniform
(`spec-*`); the spec's form varies by template choice and is signalled by the H1 — the PRD template
(`# PRD: ...`) is the default, with lighter variants available for smaller work.

**Template:** See [template-prd.md][template-prd] for the copy-ready default (PRD-shape) form.

**Key conventions:**

- **One spec per work unit** — a spec maps to a branch and task list
- **Created when work becomes active** — not speculatively during backlog
- **Living document with controlled change** — updated as understanding evolves during
  implementation, but changes should be intentional (not scope creep)
- **Problem-first framing** — lead with why, not what. "Why now" matters as much as "what to build"
- **Requirements are prioritized** — distinguish must-have from nice-to-have when scope is large
  enough to warrant it (P0/P1/P2 or similar)

**Relationship to drafts:** The spec synthesizes and crystallizes what the draft explored. It doesn't
preserve the exploration — it captures the conclusions. The draft is disposed at planning-branch
integration via the graduated path (`git rm`) once all the specs it feeds are active. One draft may
produce multiple specs when the explored scope splits into distinct work units with different
deliverables, dependencies, or review boundaries.

---

## Anti-Patterns

**Over-codifying exploration.** Draft documents should be freeform. Requiring templates, mandatory
sections, or approval gates on working documents constrains creative thinking and adds ceremony
without proportional value.

**Premature formalization.** Writing a spec before the problem is understood leads to requirements
that change constantly or miss the actual need. Invest in exploration first.

**Kitchen-sink specs.** Specs that try to be both requirements and implementation detail. Requirements
define _what_ and _why_; implementation details belong in task planning.

**Zombie drafts.** Draft documents that persist past planning-branch integration. The graduated path
disposes them via `git rm` once the spec is the authoritative artifact; leaving them around will only
cause confusion alongside the spec they fed.

**Skipping discovery.** Jumping from "I have an idea" to "here are the requirements" without asking
the hard questions about scope, alternatives, and risks. The discovery checklist exists to prevent
this.

---

## Related Documentation

- [Planning Module][planning-module] — Backlog structure, triage flow, atomic tasks **(arc-in-git)**
- [Work Organization][work-org] — Work categories, branching model, directory structure
- [Create Spec Workflow][create-spec] — Step-by-step spec creation process
- [PRD Template][template-prd] — Copy-ready default (PRD-shape) spec form
- [Draft Template][template-draft] — Optional draft document structure
- [ADR Methodology][adr-methodology] — Comparable lifecycle for architectural decisions
- [Process Task Loop][process-loop] — Task execution workflow (downstream of the spec)

---

[planning-module]: strategy-planning-module.md
[work-org]: strategy-work-organization.md
[init-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/planning/init-work-unit.md
[create-spec]: ../../../system/workflows/arc/1_create-spec.md
[template-prd]: ../../templates/arc/work-unit/spec/template-prd.md
[template-draft]: ../../templates/arc/work-unit/template-draft.md
[adr-methodology]: strategy-adr-methodology.md
[process-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[arc-config]: ../../../system/arc-config.yml
