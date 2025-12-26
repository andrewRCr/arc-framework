# ARC Agentic Development Framework

[![CI](https://github.com/andrewRCr/arc-agentic-dev-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewRCr/arc-agentic-dev-framework/actions/workflows/ci.yml)

A structured methodology for **spec-driven development** with AI agents and human developers, developed through
real-world application on complex features. Emphasizes disciplined collaboration over automation, with systematic
knowledge preservation.

## 💡 ARC Core Ideas

- **Agentic** — Optimized for AI agent collaboration alongside human teammates
- **Recursive** — Workflows feed back into themselves, enabling continuous system refinement
- **Coordination** — Shared language, documents, and checkpoints for unified operation

As **context engineering** becomes more common, this framework represents one developer's approach. Built on established
foundations — PRDs, systematic task generation and processing — but extended with **persistent project memory** via structured
documentation and workflows that create **recursive feedback loops**, strengthening projects over time by preserving
context, decisions, and patterns from each development cycle.

## ✴️ Conceptual Overview

Working with AI on complex features often feels unpredictable — big requests can produce mixed results, and valuable
context disappears between sessions. A structured approach helps bring consistency to this collaboration:

**Constitutional Documents**— foundational documents establish direction and standards:

- META-PRD (product requirement document) defines overall project vision, user flows, and success criteria
- Supporting high-level documents (PROJECT-STATUS, TECHNICAL-ARCHITECTURE, DEVELOPMENT-RULES)
   provide ongoing context and constraints

**Feature Development Cycle**— a core systematic loop guides feature work:

1. **Define Intent and Scope** — Create focused, feature-level PRDs that align with the META-PRD vision
2. **Generate Actionable Work** — Convert PRDs into specific, manageable groupings of parent and sub-tasks
3. **Guided Execution Loop** — Work through a single atomic task methodically, reviewing/editing code as needed

**Supplemental Workflow Suite**— additional workflows support the complete development lifecycle:

- Incidental work management for reactive maintenance tasks discovered during feature development
- Session handoffs for context preservation across time and team/agent boundaries
- Project memory evolution — fluid, feature-level notes mature into concrete, project-wide reference patterns
- Atomic commits for clean, traceable development history; agentic PR review processes
- Archival processes for completed work/decision history and knowledge consolidation

This systematic approach maintains architectural integrity while leveraging AI for implementation acceleration in a
hands-on, manually steered manner, with human code additions/edits, architectural decisions, and continuous
oversight— co-development rather than full automation.

### Recursive Iteration

These workflows becomes more valuable when they capture what you learn along the way:

- **Decisions get documented** as you work through the structured process
- **Patterns emerge** from repeated choices and get codified into reusable guidance
- **Context accumulates** so future work builds on what came before
- **Project knowledge** grows beyond any single feature or session

Over time, this creates development cycles that improve on themselves rather than starting fresh each time.
This documentation is explicitly dual audience— valuable for both AI agents and human team members/onboarding.

## 📚 Development Background

This framework emerged from hands-on experience building complex features with AI assistance. Rather than starting
with theory, it developed organically as solutions to real coordination challenges:

- **Context loss** between development sessions required systematic preservation
- **Quality drift** from unstructured AI requests needed systematic checkpoints
- **Knowledge fragmentation** across features called for centralized project memory
- **Architectural inconsistency** demanded clear human oversight protocols

The resulting methodology balances AI acceleration with human judgment, emphasizing sustainable development
practices over rapid prototyping. Each component addresses specific pain points encountered during production
feature development.

## 🔄 Core Development Cycle

The framework operates through feedback loops that build on previous work:

1. **Vision Alignment** — Establish direction via `META-PRD.md` and high-level constitutional documents
2. **Feature Planning** — Use `.arc/reference/workflows/1-create-prd.md` to draft focused PRDs with AI assistance
3. **Task Generation** — Apply `.arc/reference/workflows/2-generate-tasks.md` to break sub-PRDs into actionable
   task lists
4. **Iterative Execution** — Follow `.arc/reference/workflows/3-process-task-loop.md` for controlled
   AI-assisted single-task processing
5. **Session Continuity** — Track context in `CURRENT-SESSION.md` using
   `.arc/reference/workflows/supplemental/session-handoff.md` for seamless handoffs
6. **Knowledge Integration** — Evolve decisions and patterns into permanent project memory for future cycles

## 🗂️ System Components

### Constitutional Documents

- **`.arc/reference/constitution/META-PRD.md`** — Product vision, success criteria, and high-level direction
- **`.arc/reference/constitution/PROJECT-STATUS.md`** — Progress tracker for current initiatives and milestones
- **`.arc/reference/constitution/TECHNICAL-ARCHITECTURE.md`** — Reference architecture and implementation patterns
- **`.arc/reference/constitution/DEVELOPMENT-RULES.md`** — Code standards, quality gates, and development protocols

### Planned Work (Feature & Technical)

- **PRDs** — Specifications flow from `upcoming/` to `active/feature/` (user-facing) or `active/technical/`
  (infrastructure) during development
- **Task Lists** — Generated from PRDs; work categorization guides branch naming (`feature/`, `technical/`)
- **Session Context** — Track active work progress in `active/CURRENT-SESSION.md` with handoff instructions

### Incidental Work

- **Parallel Workflow** — Reactive maintenance tasks use `active/incidental/tasks-incidental-*.md` structure
- **Work Prioritization** — Feature work pauses for incidental tasks; multiple incidental work units can stack
- **Status Tracking** — Each task list includes status (pending/in-progress/complete/paused) and branching context
- **Same Structure** — Follows identical patterns to feature work but in dedicated subdirectory to prevent overlap

### Knowledge Evolution

- **Working Notes** — Untracked temporal workspace files (`active/*/notes-*.md`) for scope-specific scratch work,
  cleared frequently as work progresses
- **Evolved Patterns** — Mature insights move from active work to `reference/strategies/` (stable patterns)
- **Completed Work** — Finished features archive to `reference/archive/` with full historical context

### Process Workflows

- **`.arc/reference/workflows/1-create-prd.md`** — Generate focused PRDs from product direction
- **`.arc/reference/workflows/2-generate-tasks.md`** — Turn approved PRDs into agent-ready task lists
- **`.arc/reference/workflows/3-process-task-loop.md`** — Execute tasks with human oversight checkpoints
- **`.arc/reference/workflows/supplemental/manage-incidental-work.md`** — Systematic lifecycle for reactive
  maintenance tasks
- **`.arc/reference/workflows/supplemental/session-handoff.md`** — Package context for session transfers
- **`.arc/reference/workflows/supplemental/agent-pr-review.md`** — Guide AI-assisted pull request reviews
- **`.arc/reference/workflows/supplemental/atomic-commit.md`** — Enforce minimal, well-scoped commits
- **`.arc/reference/workflows/supplemental/archive-completed.md`** — Move finished work to long-term storage

### Customization

- **`templates/`** — Reusable document templates for rapid instantiation
- **`profiles/`** — Stack-specific overlays and configuration variants

## 🚀 Getting Started

Ready to implement ARC in your project? See **`ADOPTION.md`** for the complete rollout playbook, including
step-by-step setup instructions, customization options, and team onboarding guidance.

## 🔗 Production Usage

This framework was developed and refined through building [CineXplorer](https://github.com/andrewRCr/CineXplorer),
a full-stack movie discovery application. The system evolved organically from practical needs encountered during
feature development, where coordinating AI assistance while maintaining code quality became essential.

**Real-world application demonstrates:**

- Complex feature coordination (search, recommendations, user management)
- Multi-session development with context preservation
- Quality gate enforcement preventing technical debt accumulation
- Successful handoffs between different AI agents and manual development phases

The CineXplorer `.arc/` directory provides a complete example of the framework in action, showing how
abstract processes translate to concrete project management.

## 📄 License

The ARC Agentic Development Framework is licensed under the Apache License 2.0.
See the `LICENSE` file for the full license text.

## 🔗 Related Assets

- `.arc/README.example.md` for an in-repo tour.
- `templates/` to spin up new artifacts quickly.
- `profiles/` to tailor the framework to your stack.
