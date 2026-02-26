# Strategy: Work Planning

**Purpose:** Codify the planning pipeline that takes work from initial idea through to structured
requirements. Covers the full lifecycle: backlog items → plan documents → PRDs → task lists, with
conventions for each stage.

**Scope:** Planning artifact conventions, discovery guidance, and stage transitions. For backlog
structure and triage, see [Backlog Organization][backlog-org]. For active work categories and git
workflow, see [Work Organization][work-org]. For task execution, see [Process Task
Loop][process-loop].

---

## Contents

- [The Planning Pipeline](#the-planning-pipeline)
- [Plan Documents](#plan-documents)
- [Discovery Checklist](#discovery-checklist)
- [PRD Readiness](#prd-readiness)
- [PRD Conventions](#prd-conventions)
- [Anti-Patterns](#anti-patterns)

---

## The Planning Pipeline

Work moves through increasing fidelity stages. Each stage has a purpose and an appropriate level of
structure — earlier stages are deliberately lighter than later ones.

```text
Backlog item          →  plan-*.md           →  PRD                →  Task list
(problem identified)     (exploration)          (requirements)        (execution)

Fidelity:  Low           Working draft          Structured            Detailed
Structure: Bullet item   Freeform               Template-based        Workflow-governed
Lifespan:  Until triaged Ephemeral (deleted)    Semi-permanent        Active → archived
```

**Key principle:** Each stage's documentation should match its fidelity level. Requiring PRD-level
structure in a plan document is premature formalization. Leaving a PRD at plan fidelity is
under-specification.

Not every piece of work needs every stage. Small, well-understood work can skip the plan stage and
go directly from backlog to PRD. The plan stage exists for work that benefits from exploration
before requirements crystallize.

---

## Plan Documents

Plan documents (`plan-*.md`) are **freeform exploration artifacts** — working documents where ideas,
research, alternatives, and evolving understanding are captured. They are temporal scratchpads, not
permanent records.

### Purpose

- Explore a problem space before committing to requirements
- Capture research findings, resolved decisions, and approach
- Surface unknowns and alternatives before scope locks in
- Feed into one or more PRDs when understanding is sufficient

### Convention

**Naming:** `plan-[descriptor].md` — category conveyed by directory placement (`backlog/feature/` or
`backlog/technical/`).

**Lifecycle:**

- Created when a backlog item needs exploration before it can become a PRD
- Evolved iteratively as understanding deepens — expect messiness, dead ends, revisions
- Deleted after the PRD is written and stable (the PRD captures what matters; the plan has served
  its purpose)
- Multiple plans can feed a single PRD (many-to-one)

**What to capture (guidance, not requirements):**

The most valuable things to document during exploration, in rough priority order:

1. **Problem and motivation** — what are we solving and why now?
2. **Alternatives explored** — what else was considered and why was it rejected?
3. **Key unknowns** — what don't we know yet? What assumptions are we making?
4. **Scope estimate** — rough size (small/medium/large or T-shirt sizing)
5. **Dependencies** — what does this depend on or block?

None of these are mandatory sections. Plans are freeform by design — some will be structured notes,
others will be stream-of-consciousness exploration, others will be mostly research synthesis. The
value is in the thinking, not the format.

**Optional template:** For those who want starting structure, see [template-plan.md][template-plan].
Using the template is optional — many plans work better as unstructured working documents.

### Supplemental Files

Plans may be accompanied by supplemental files in the same directory:

- `notes-*.md` — additional analysis, detailed notes
- `research-*.md` — research synthesis (often moved to `reference/research/` for archival)
- `design-*.md` — design exploration documents

These follow the same ephemeral convention: delete or archive after the work graduates.

---

## Discovery Checklist

Before a plan is "ready" to become a PRD, these questions should be addressed. This is guidance, not
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
requirements. Better discovery produces better PRDs — resist the pull to generate output before
understanding the problem.

---

## PRD Readiness

Lightweight signals that a plan has matured enough to become a PRD. These are indicators, not a
formal approval gate.

**The plan is likely ready when:**

- The problem and motivation are clear to someone who wasn't involved in exploration
- At least one alternative approach was considered (even if briefly)
- Key unknowns are identified (not necessarily resolved — but known)
- Scope is bounded enough to write requirements against
- Major dependencies are identified

**The plan is likely not ready when:**

- The problem statement keeps shifting
- No alternatives were explored (first idea accepted without question)
- Fundamental unknowns remain that could change the entire approach
- Scope is unbounded or growing with each discussion

**When ready:** Create the PRD using the [create-prd workflow][create-prd] and the [PRD
template][template-prd]. Delete the plan document once the PRD is stable.

---

## PRD Conventions

PRDs are the structured, semi-permanent requirements documents that bridge exploration and
execution. They define _what_ and _why_; task lists define _how_.

**Template:** See [template-prd.md][template-prd] for the copy-ready starting point.

**Key conventions:**

- **One PRD per work unit** — a PRD maps to a branch and task list
- **Created when work becomes active** — not speculatively during backlog
- **Living document with controlled change** — updated as understanding evolves during
  implementation, but changes should be intentional (not scope creep)
- **Problem-first framing** — lead with why, not what. "Why now" matters as much as "what to build"
- **Requirements are prioritized** — distinguish must-have from nice-to-have when scope is large
  enough to warrant it (P0/P1/P2 or similar)

**Relationship to plans:** The PRD synthesizes and crystallizes what the plan explored. It doesn't
preserve the exploration — it captures the conclusions. The plan can be deleted once the PRD is
stable.

---

## Anti-Patterns

**Over-codifying exploration.** Plan documents should be freeform. Requiring templates, mandatory
sections, or approval gates on working documents constrains creative thinking and adds ceremony
without proportional value.

**Premature formalization.** Writing a PRD before the problem is understood leads to requirements
that change constantly or miss the actual need. Invest in exploration first.

**Kitchen-sink PRDs.** PRDs that try to be both requirements and implementation spec. Requirements
define _what_ and _why_; implementation details belong in task planning.

**Zombie plans.** Plan documents that persist after the PRD is written. Delete them — they've served
their purpose and will only cause confusion if kept alongside the authoritative PRD.

**Skipping discovery.** Jumping from "I have an idea" to "here are the requirements" without asking
the hard questions about scope, alternatives, and risks. The discovery checklist exists to prevent
this.

---

## Related Documentation

- [Backlog Organization][backlog-org] — Backlog structure, triage flow, atomic tasks
- [Work Organization][work-org] — Work categories, branching model, directory structure
- [Create PRD Workflow][create-prd] — Step-by-step PRD creation process
- [PRD Template][template-prd] — Copy-ready PRD starting point
- [Plan Template][template-plan] — Optional plan document structure
- [ADR Methodology][adr-methodology] — Comparable lifecycle for architectural decisions
- [Process Task Loop][process-loop] — Task execution workflow (downstream of PRD)

---

[backlog-org]: strategy-backlog-organization.md
[work-org]: strategy-work-organization.md
[create-prd]: ../../../system/workflows/arc/1_create-prd.md
[template-prd]: ../../templates/template-prd.md
[template-plan]: ../../templates/template-plan.md
[adr-methodology]: strategy-adr-methodology.md
[process-loop]: ../../../system/workflows/arc/3_process-task-loop.md
