# ARC Framework Project-Level PRD (PROJECT-PRD)

The project-level PRD — the canonical statement of what this project is, the problem it addresses,
and what it bounds itself to do. Referenced at lifecycle ceremonies as the alignment check for
proposed work: does this serve the stated problem? Does it fall within scope? Does it align with
project principles?

Work-unit PRDs (one per chunk of work) reference this for context. PROJECT-PRD is the canonical
statement of what this project is; other ARC surfaces handle methodology, domain guidance, and
decision records.

> [!IMPORTANT]
> **Update Discipline.** This document updates on two triggers — never on cadence.
>
> - **Organic**: When a PR surfaces ambiguity or conflict against documented Problem, Scope, or
>   Principles, resolve it here as part of that PR. The conflict is the signal.
> - **Event-driven**: Major releases, fundamental scope shifts, or governance changes (new
>   principle, retired principle, scope boundary redrawn). These edits ride a dedicated commit with
>   rationale.
>
> Cadence-driven reviews are not used; they drift the document from real decisions.

## Problem

AI-assisted software development tends toward two failure modes, both responses to the same
premise: that human attention is a bottleneck to engineer around. Spec-it-and-walk-away workflows
minimize human touchpoints by treating the spec as a faithful map of the territory — producing
code that no developer deeply understands and eroding both maintainability and judgment in the
process. Undisciplined parallelism — multiple projects, many worktrees, dozens of concurrent agent
sessions — treats attention as something that scales by multiplexing, which decades of cognitive
science consistently shows it does not.

ARC starts from the opposite premise. Human attention for novel knowledge work is single-threaded
by nature, and the irreplaceable quality input it provides is what distinguishes good software
from plausible-looking code. Treating it as a design primitive rather than a limitation is the
methodology's foundational choice. Bounded, deliberate concurrent work has its place; the
throughput multiplier comes from making each line of focused attention more effective, not from
spreading attention thinner.

The shape that follows: codify the deterministic so operational friction stops costing attention;
preserve friction where judgment is required so human input lands at the points that matter;
structure interaction so human and agent contribute their complementary strengths — perspective
and judgment from one, breadth and speed from the other — at a frequency that keeps both engaged.
The result is work that reflects genuine collaboration rather than a process optimized to minimize
human involvement.

## Scope

### In Scope

- **The methodology for the execution pair** — how a developer and an agent work through
  implementation together: planning, execution, verification, and context preservation. The
  governance unit is one developer + one agent + one work unit at a time.
- **Configurable conventions over fixed shape** — config values, methods, extensions, and strong
  defaults that teams replace at convention level. Principles are non-negotiable; everything else
  adapts.
- **Workflows for the full work-unit lifecycle** — specification generation, task decomposition,
  task execution loop, session lifecycle (init / handoff), integration, archival.
- **Tooling that operationalizes the methodology** — CLI commands (`arc` entry points), git hooks
  enforcing commit and push discipline, templates for PRDs / plans / task lists / meta files.
- **Cross-tool and cross-platform compatibility** — agent-agnostic, harness-agnostic, OS-agnostic
  by design. Strong defaults where ARC ships defaults; accommodation of adjacent tools (IDEs, diff
  viewers, external worktree managers, dev environments) is the default posture.

### Out of Scope

- **Team coordination methodology** — sprint planning, story formats, estimation, board
  structures, role definitions. ARC operates below and alongside team-level methodologies (Scrum,
  Kanban, SAFe) without prescribing them.
- **Throughput optimization** — ARC optimizes for collaboration quality, not raw output velocity.
  Teams whose primary need is maximizing throughput on bounded, deterministic work may find
  delegation-based approaches more appropriate for that work.
- **Fully autonomous, async, or cloud agents executing in isolation** — break the shared-context
  premise that co-development depends on. ARC functions at the boundaries (specification,
  verification) but the core value is absent during isolated execution.
- **Application code generation** — ARC is a methodology expressed as documentation. CLI tooling
  supports adoption and lifecycle operations; it does not produce application code.
- **Prescribing internal tool choices** — ARC doesn't dictate IDE, diff viewer, agent harness,
  worktree manager, or adjacent dev environment. Strong defaults exist for what ARC ships;
  non-restriction is the default for everything else.

## Principles

- **Co-development**: Humans and agents work implementation together in bounded review increments,
  with the developer present during execution rather than at the end. Frequency of exchange is
  itself a design variable.

- **Spec-directed, not spec-driven**: Written specifications direct collaborative implementation
  rather than authorize autonomous execution. The spec is rigorous shared context for the pair,
  not a blueprint for solo execution — implementation routinely surfaces what even thorough
  planning can't foresee.

- **Operational friction down, judgment friction up**: Codify the deterministic — workflows,
  hooks, methods — so it stops costing attention. Preserve friction where judgment is required,
  so human input lands at the points that matter.

- **Configurable methodology, open ecosystem**: Replaceable conventions over fixed shape
  (internal); agnostic to agent, harness, IDE, and adjacent tools (external). Strong defaults
  everywhere; carve-outs only where something is genuinely incompatible with a principle.

- **Designed to evolve**: Patterns from work feed back into the methodology — internal learning,
  field testing, and external developments in agentic software development all reshape
  conventions over time. Principles are stable; conventions adapt. ARC is developed using ARC.

## Mission

ARC aims to facilitate human-AI software collaboration that produces work genuinely better than
either could alone. The methodology and the framework that implements it are designed to keep the
developer's judgment shaping the implementation as it unfolds, while still leveraging the agent's
complementary strengths — across project shapes, team sizes, and the evolving landscape of agentic
software development.

## Design Tradeoffs

- **Focused attention over multi-tracked throughput**: Chose sustained focus on a primary line of
  work — with bounded concurrent work where it serves — over raw output velocity from
  multi-tracking attention. Cost: ARC is slower than fully autonomous approaches. Teams optimizing
  for code throughput on bounded, deterministic work may find delegation-based approaches more
  appropriate.

- **Configurability with strong defaults over a fixed shape**: Chose adaptable conventions + a
  non-negotiable principle core over a single prescribed methodology. Cost: steeper initial
  learning curve (principles, conventions, methods, extensions); larger documentation surface;
  more decisions to make at adoption time.

- **Co-development primacy over universal agent compatibility**: Chose in-flight, shared-context
  collaboration as ARC's center over compatibility with the full agentic-tooling ecosystem. Cost:
  fully autonomous, async, or cloud agents that execute in isolation fall outside ARC's design
  target; the core value is absent during isolated execution.

- **Stable principles, adaptive conventions**: Chose a stable principle core with adaptive
  conventions over either a frozen framework or one in perpetual change. Cost: the framework
  requires ongoing maintenance; teams must track convention evolution across releases; the
  methodology doesn't reach a "done" state.

## Success Criteria

### Methodology coherence

- Principles are internally consistent — no contradictions across workflows, methods, or
  conventions.
- Sharp principle/convention boundary — every practice in the framework is unambiguously
  classified.
- Strategy and reference documents are actionable for implementation without requiring further
  design decisions.

### Project self-sufficiency

- Teams configure the framework to their context through documented mechanisms; no
  framework-author intervention required for routine adoption or scaling.
- Different project shapes (solo, small team, larger team, varying tech stacks) fit within the
  configurability surface without requiring custom forks.
- External methodology integration (existing team-level processes like Scrum, Kanban) works
  through documented patterns rather than methodology conflict.

### Framework durability

- CLI package is open-source-ready — stable public surface (commands, config schema, exit codes)
  across versions, agent-agnostic code, typed contracts at integration boundaries, and
  contributor-navigable architecture supported by documented testing patterns.
- Templates and workflows remain copy-ready with comprehensive inline guidance.
- Framework evolution happens through codified feedback loops — patterns from work, field
  testing, and the surrounding ecosystem all reshape conventions over time without disrupting
  principle stability.

## References

- [`principles.md`][principles] — full 11-principle adopter contract with conventions and
  rationale per principle.
- [`rationale.md`][rationale] — the Three Observations (single-threaded attention, software is
  for humans, collaboration improves with frequency) with research grounding.
- [`the-framework.md`][the-framework] — session lifecycle, skills, task execution, committing,
  handoffs.
- [`STRATEGY-INDEX.md`][strategy-index] — codified strategy guidance across domains.
- Forward-compat check-docs — internal architectural direction along three evolution axes:
  [`strategy-storage-evolution.md`][storage-evolution] (where state lives),
  [`strategy-knowledge-evolution.md`][knowledge-evolution] (where guidance lives), and
  [`strategy-procedure-evolution.md`][procedure-evolution] (how procedure executes). Each points at its
  north-star draft; consult per its Self-Check when planning work in its axis.

---

[principles]: ../../docs/methodology/principles.md
[rationale]: ../../docs/methodology/rationale.md
[the-framework]: ../../docs/the-framework.md
[strategy-index]: strategies/STRATEGY-INDEX.md
[storage-evolution]: strategies/project/strategy-storage-evolution.md
[knowledge-evolution]: strategies/project/strategy-knowledge-evolution.md
[procedure-evolution]: strategies/project/strategy-procedure-evolution.md
