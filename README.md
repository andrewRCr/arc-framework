# ARC Agentic Development Framework

[![CI](https://github.com/andrewRCr/arc-agentic-dev-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewRCr/arc-agentic-dev-framework/actions/workflows/ci.yml)

A structured methodology for **spec-driven development** with AI agents and human developers, developed through
real-world application on complex features. Emphasizes disciplined collaboration over automation, with systematic
knowledge preservation.

As context engineering becomes more common, this framework represents one developer's approach. Built on established
foundations—PRDs, systematic task generation and processing—but extended with persistent project memory via structured
documentation and workflows that create recursive feedback loops, strengthening projects over time by preserving
context, decisions, and patterns from each development cycle.

## 💡 Core Idea

Working with AI on complex features often feels unpredictable—big requests can produce mixed results, and valuable
context disappears between sessions. A structured approach helps bring consistency to this collaboration:

### Foundation: Structured AI Collaboration

Every project begins with foundational high-level documents that establish direction and standards:
•  META-PRD (product requirement document) defines overall product vision, user flows, and success criteria
•  Supporting constitutional documents (TECHNICAL-ARCHITECTURE, DEVELOPMENT-RULES, PROJECT-STATUS)
   provide ongoing context and constraints

Feature Development Cycle: With this foundation in place, feature development follows a systematic approach:

1. **Define Scope** — Create focused, feature-level Sub-PRDs that align with the META-PRD vision
2. **Break Down Work** — Convert Sub-PRDs into specific, manageable task lists
3. **Guided Execution** — Work through tasks methodically, reviewing and often editing each piece before moving forward

Extended Workflow Suite: Additional workflows support the complete development lifecycle:
•  Session handoffs for context preservation across time and team/agent boundaries
•  Project memory evolution — temporary, feature-level notes mature into permanent, project-wide reference patterns
•  Atomic commits for clean, traceable development history; agentic PR review processes
•  Archival processes for completed work/decision history and knowledge consolidation

This systematic approach maintains architectural integrity while leveraging AI for implementation acceleration.

### Recursive Iteration

The same workflow becomes more valuable when it captures what you learn along the way:

- **Decisions get documented** as you work through the structured process
- **Patterns emerge** from repeated choices and get codified into reusable guidance
- **Context accumulates** so future work builds on what came before
- **Project knowledge** grows beyond any single feature or session

Over time, this creates development cycles that improve on themselves rather than starting fresh each time.

## 👥 Philosophy

This systematic approach reflects several key principles:

- **Co-development over full automation** — AI assists implementation while humans maintain architectural control
- **Structured workflows over ad-hoc requests** — Systematic spec-driven development with clear checkpoints
- **Context preservation over starting fresh** — Project knowledge that compounds rather than resets

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

## 🔄 Key Characteristics

- **Hands-on collaboration model** — You stay the architect; AI assists in implementation under your direction
- **Persistent project memory** that captures and reuses context, decisions, and patterns
- **Dual-audience documentation** valuable for both AI agents and human team members/onboarding
- **Session continuity** across AI agent switches, team handoffs, and development cycles
- **Manual steering encouraged** — Expects human code additions/edits, architectural decisions, and continuous oversight

## 🏡 How the System Works

The framework operates through feedback loops that build on previous work:

### Core Development Cycle

1. **Vision Alignment** — Establish direction via `_docs/META-PRD.md` and high-level constitutional documents
2. **Feature Planning** — Use `_docs/workflows/1-create-sub-prd.md` to draft focused sub-PRDs with AI assistance
3. **Task Generation** — Apply `_docs/workflows/2-generate-tasks.md` to break PRDs into actionable task lists
4. **Iterative Execution** — Follow `_docs/workflows/3-process-task-loop.md` for controlled AI task processing
5. **Session Continuity** — Track progress in `_docs/CURRENT-SESSION.md` for seamless handoffs
6. **Knowledge Integration** — Evolve decisions and patterns into permanent project memory for future cycles

### Project Memory System

Context and decisions are preserved through structured documentation:

- **`_docs/PROJECT-STATUS.md`** — Long-lived progress, risks, and milestones visible to the whole team
- **`_docs/sub-prds/`** + **`_docs/tasks/`** — Document what was planned and what's in flight for context rehydration
- **`_docs/notes/`** → **`_docs/reference/`** — Evolution from fluid decisions to stable patterns and standards
- **`_docs/archive/`** — Complete audit trail of past cycles with full provenance
- **`_docs/CURRENT-SESSION.md`** — Active context and handoff instructions for agents and team members

### Recursive Improvement

- **Task outcomes** inform project status and future planning
- **Pattern recognition** moves temporary insights into permanent references
- **Architecture decisions** update templates and workflows for consistency
- **Session handoffs** preserve context and lessons learned across transitions
- **Quality gates** capture issues to prevent repetition in future cycles

## 🗂️ System Components

### Constitutional Documents

- **`_docs/META-PRD.md`** — Product vision, success criteria, and high-level direction
- **`_docs/PROJECT-STATUS.md`** — Progress tracker for current initiatives and milestones
- **`_docs/TECHNICAL-ARCHITECTURE.md`** — Reference architecture and implementation patterns
- **`_docs/DEVELOPMENT-RULES.md`** — Code standards, quality gates, and development protocols

### Feature Development

- **`_docs/sub-prds/`** — Approved feature specifications and requirements
- **`_docs/tasks/`** — Task checklists derived from sub-PRDs for implementation
- **`_docs/CURRENT-SESSION.md`** — Active session context and handoff instructions

### Knowledge Evolution

- **`_docs/notes/`** — Temporal decision logs and research (fluid)
- **`_docs/reference/`** — Established standards, patterns, and guidance (stable)
- **`_docs/archive/`** — Completed feature docs with full historical context

### Process Workflows

- **`_docs/workflows/1-create-sub-prd.md`** — Generate focused sub-PRDs from product direction
- **`_docs/workflows/2-generate-tasks.md`** — Turn approved sub-PRDs into agent-ready task lists
- **`_docs/workflows/3-process-task-loop.md`** — Execute tasks with human oversight checkpoints
- **`_docs/workflows/session-handoff.md`** — Package context for session transfers
- **`_docs/workflows/agent-pr-review.md`** — Guide AI-assisted pull request reviews
- **`_docs/workflows/atomic-commit.md`** — Enforce minimal, well-scoped commits
- **`_docs/workflows/archive-completed.md`** — Move finished work to long-term storage

### Customization

- **`templates/`** — Reusable document templates for rapid instantiation
- **`profiles/`** — Stack-specific overlays and configuration variants

## 🏷️ ARC Pillars

- **Agentic** — Optimized for AI agent collaboration alongside human teammates
- **Recursive** — Workflows feed back into themselves, enabling continuous system refinement
- **Coordination** — Shared language, documents, and checkpoints for unified operation

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

The CineXplorer `_docs/` directory provides a complete example of the framework in action, showing how
abstract processes translate to concrete project management.

## 📄 Attribution and License

The ARC framework builds upon and extends excellent foundational work from the open source community:

### Core Workflow Foundation

The three core workflows (`1-create-sub-prd.md`, `2-generate-tasks.md`, `3-process-task-loop.md`) are derived from the
[AI Dev Tasks](https://github.com/snarktank/ai-dev-tasks) project by snarktank, licensed under Apache 2.0.
These workflows have been significantly enhanced and integrated into the broader ARC system:

- **Original workflows**: Simple 3-step PRD → Tasks → Process cycle
- **ARC enhancements**: META-PRD integration, PROJECT-STATUS tracking, DEVELOPMENT-RULES for code standards,
  feature branch management, quality gates, session handoffs, agent-assisted PR reviews, atomic commit protocols,
  and comprehensive task completion workflows

### Original Contributions

All other components represent original work, including:

- The broader ARC framework architecture and methodology
- Session management and context preservation systems
- Documentation templates and organizational structure
- AI agent coordination patterns and boundaries
- Quality gate integration and NPX-based tooling approach
- The recursive refinement philosophy and adoption playbook

See `NOTICE` file for complete attribution details.

### License

The ARC Agentic Development Framework is licensed under the Apache License 2.0.
See the `LICENSE` file for the full license text.

## 🔗 Related Assets

- `_docs/README.example.md` for an in-repo tour.
- `templates/` to spin up new artifacts quickly.
- `profiles/` to tailor the framework to your stack.
