# Research: AI-Agent Development Framework Landscape

**Date:** 2026-02-17
**Purpose:** Understand what exists in the structured AI-agent development methodology space
to inform ARC framework positioning and content refinement work.
**Method:** External research via web search across multiple categories.

---

## Executive Summary

The landscape is dominated by three categories: (1) runtime/code-first SDKs (LangGraph,
CrewAI, OpenAI Agents SDK, AutoGen) for multi-agent orchestration; (2) IDE-integrated
agents (Cline, Cursor, Copilot) with embedded rules systems; and (3) lightweight
specification standards (AGENTS.md, .cursorrules). No framework was found that combines
integrated methodology, session protocols, and structured task execution as pure
documentation, agent-agnostic and stack-agnostic with no runtime.

---

## Direct Analogues

### Cursor Memory Bank (vanzan01/cursor-memory-bank)

Closest match found. Structured development workflow for Cursor IDE using custom commands
(/van, /plan, /creative, /build, /reflect, /archive). Hierarchical rule loading,
memory-bank directory structure (tasks.md, activeContext.md, progress.md).

- **Scope:** Cursor-specific, not agent-agnostic
- **Session continuity:** Implicit in memory architecture, no explicit handoff protocol
- **Approval gates:** None
- **Adoption:** Low, appears to be a personal project
- **Key difference from ARC:** Runtime commands, not pure documentation methodology.
  No constitutional documents, no approval gates, single-IDE.

### GitHub Agentic Workflows (github/gh-aw)

Markdown-based workflow definitions executable in GitHub Actions. Read-only by default
with human approval gates for write operations. 3K+ stars.

- **Scope:** GitHub-specific, focused on CI/CD automation (issue triage, code review,
  repo management), not general development methodology
- **Session continuity:** Implicit in GitHub Actions, not explicit methodology
- **Approval gates:** For operations, not task execution workflow
- **Key difference from ARC:** Platform-specific, automation-focused. No constitutional
  documents, no spec-driven development, no cross-session context preservation.

### Memory Bank Systems (Cline, ccmanager)

Cline (8K+ stars) has Focus Chain (todo-list system) and context management.
ccmanager supports 6+ coding agents as a session manager.

- **Scope:** Runtime features embedded in agents, not methodology frameworks
- **Key difference from ARC:** These manage state within existing task execution,
  not methodology-level structure.

---

## Adjacent: Code-First Multi-Agent SDKs

These are the high-star-count projects in the space, but they solve a fundamentally
different problem: programmatic orchestration of multiple AI agents.

### LangGraph (LangChain) - 10K+ stars

Graph-based workflow design with human-in-the-loop via interrupts. Session persistence
with checkpointers. Python/TypeScript runtime required.

Human-in-the-loop pattern: Agent -> Tool Call -> Interrupt -> Human Review ->
Approve/Edit/Reject -> Resume. Approval is at the tool-call level, not task-execution
level.

### CrewAI - 20K+ stars

Role-based multi-agent orchestration with sequential task execution. Human feedback
decorators and task-level approval flags. Python runtime required.

### OpenAI Agents SDK - 11K+ stars (released March 2025)

Lightweight Python framework with native session memory (Conversations API). Context
trimming and summarization. Handoff primitives for delegating between agents.

Most relevant to ARC's session continuity concern, but sessions are implicit API state,
not explicitly documented methodology.

### AutoGen (Microsoft) - 45K+ stars

Conversational multi-agent architecture. Most popular by stars but least aligned with
ARC's methodology approach.

**Common limitation across all SDKs:** Code-first, require runtime, approval gates are
for tool/API calls not development workflow phases, no specification/documentation as
first-class artifact, no agent-agnostic methodology.

---

## Adjacent: Specification Standards

### AGENTS.md (Open Standard) - 60K+ projects

Lightweight markdown briefing file for AI coding agents. Sections: Build & Test,
Architecture Overview, Security, Git Workflows, Conventions. Recommended under 150
lines. Supported by Google, OpenAI, Factory, Sourcegraph, Cursor.

AGENTS.md is passive reference material. ARC is an active methodology with workflows,
gates, and session continuity. ARC's own AGENTS.md serves a similar entry-point role
but as part of a larger system.

### Cursor Rules / .cursorrules / .clinerules

System prompt extensions. Ubiquitous among Cursor users. Evolved to .cursor/rules/*.mdc
format. Single-purpose: "tell the AI how to behave." No workflow, no approval gates,
no session protocols.

### Spec-Driven Development (emerging practice)

Multiple sources document spec-driven development as a methodology (Addy Osmani,
Augment Code, JetBrains, Zencoder). The pattern: Specification Phase -> Planning Phase
-> Task Phase. But no open framework operationalizes the full pipeline as ARC does.

---

## Table-Stakes vs Novel

### Industry table-stakes (everyone does this)

- Rules/instructions files (some form of agent configuration)
- Human-in-the-loop / approval gates (as a feature)
- Context window optimization (trimming, summarization)
- Markdown as a specification format

### Appears genuinely novel to ARC

1. **Explicit session handoff protocols** as documented, transferable methodology
   (not runtime state management)
2. **Integrated system:** constitutional documents + task methodology + session
   protocols in one framework
3. **Agent-agnostic + stack-agnostic + no runtime** (everything else is locked to
   a specific agent, IDE, or requires Python)
4. **Single-threaded execution with structured approval gates between subtasks**
   (industry is pushing toward multi-agent autonomy; ARC goes opposite direction)
5. **Feature/technical/incidental work organization** (not found elsewhere)
6. **Full PRD -> task generation -> execution -> quality gates pipeline** as
   documented methodology

---

## Audience Expectations

Based on how comparable projects present themselves:

1. **Lead with problem/philosophy, not features** (GitHub Agentic Workflows does
   this well)
2. **Include trade-offs explicitly** (GitHub Agentic Workflows: "requires careful
   human supervision, and even then things can still go wrong")
3. **Multiple entry points:** Quick start (5 min), conceptual overview (20 min),
   deep dive (1+ hour). Most frameworks fail here.
4. **Real examples:** Show actual session transcripts, task executions, handoff
   examples
5. **Address trust explicitly:** ARC's approval gates and human coupling are
   inherently trust-preserving

---

## Sources

- [CrewAI GitHub](https://github.com/crewAIInc/crewAI)
- [LangGraph Documentation](https://www.langchain.com/langgraph)
- [OpenAI Agents SDK](https://github.com/openai/openai-agents-python)
- [GitHub Agentic Workflows](https://github.com/github/gh-aw)
- [Cursor Memory Bank](https://github.com/vanzan01/cursor-memory-bank)
- [Cline Documentation](https://docs.cline.bot/prompting/understanding-context-management)
- [AGENTS.md Standard](https://agents.md/)
- [How to write a good spec for AI agents (Addy Osmani)](https://addyosmani.com/blog/good-spec/)
- [Spec-Driven Development (Augment Code)](https://www.augmentcode.com/guides/mastering-spec-driven-development-with-prompted-ai-workflows-a-step-by-step-implementation-guide)
- [AI Agent Frameworks (Shakudo)](https://www.shakudo.io/blog/top-9-ai-agent-frameworks)
- [CrewAI vs LangGraph vs AutoGen (DataCamp)](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)
