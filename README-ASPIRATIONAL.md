# ARC Framework

<!-- STATUS: Aspirational draft — planning artifact for content refinement work.
     Some sections describe features that are in development (distribution CLI,
     quick start). Placeholder content is marked with [PLACEHOLDER]. This document
     serves as a north star for how the framework should present itself to a fresh
     developer user. It lives in the private dev repo, not the public release repo. -->

A structured methodology for spec-driven development with AI agents. ARC is built
around the idea that **deliberately coupling human judgment with agent capability**
produces better results than separating them through delegation.

ARC is not an agent SDK or orchestration framework — it's a methodology implemented
as portable markdown documents with no runtime dependencies beyond Git. It provides
project organization, shared context, and task execution workflows in a single
system that works with any AI coding agent and any tech stack.

## Philosophy

ARC is built around a specific idea about how human-agent development works best:
**disciplined collaboration over automation.**

The industry trend is toward more agent autonomy — multi-agent systems, longer
unsupervised runs, less human involvement per unit of output. ARC makes a different
bet: that tighter human-agent coupling produces better results, not worse ones, and
that the developer's sustained attention is a feature, not a bottleneck.

Task execution is intentionally single-threaded. Work gets scoped into discrete
actions small enough to review meaningfully. The developer stays actively involved,
not as a rubber stamp at the end, but throughout: watching the work happen, catching
wrong turns early, course-correcting requirements that weren't as clear as you
thought, and writing code alongside the agent. The goal is a tight feedback
loop that leverages complementary strengths.

This has a side effect that matters more than it might seem at first: **you stay
connected to your codebase.** When work is broken into small, reviewable pieces and
you're paying attention to each one, you maintain a real understanding of what's
changing and why. You don't end up in the situation where the agent built something
that works but you can't explain how, or where a section of your project has become
a black box. You can trust the output because you were there for every piece of it.

The framework doesn't assume any particular ratio of agent-written to human-written
code. Some developers prefer the agent to handle most implementation while they focus
on review and direction. Others write significant amounts of code themselves, using
the agent for specific tasks or as a second pair of eyes. ARC supports both ends of
that spectrum and everything in between. The common thread is that you're engaged
with the work, not just waiting for results.

Shared context documents (project goals, architecture, development standards) keep
both human and agent operating from the same understanding. Session protocols preserve
continuity when the agent's memory resets.

## The Core Loop

The daily rhythm:

```text
Developer: resume session  ──>  Agent: initialize (load full project context)
                                         |
                                         v
                                Work proceeds (subtasks, review, co-development)
                                         |
                                         v
Developer: trigger handoff  <--  Agent: preserve session state
         |
         v
    [new session]
```

<!-- [FUTURE] Screenshot: terminal showing a freshly initialized session — the
     agent's orientation acknowledgment after reading constitutional docs. -->

1. **Resume** — developer invokes session initialization (slash command, skill, or
   direct workflow reference).
2. **Initialize** — agent reads constitutional documents, current session state,
   active task list, development rules. Full project context from the start.
3. **Work** — agent works through subtasks from the task list, one at a time. After
   each: quality checks, task list update, report, then a stop for developer review.
   The developer watches along, steers, provides feedback, and sometimes works on
   their own tasks in parallel.
4. **Handoff** — when the context window is getting full (or the work is done),
   developer triggers handoff. Agent captures completed work, uncommitted changes,
   and next actions into a structured document.
5. **Repeat** — next session picks up where this one left off.

Everything else (defining your project's constitution, creating PRDs, generating
task lists, managing incidental work, archiving) supports this loop. Project setup
is mostly a one-time thing. The loop is what repeats.

## What You Get

<!-- [FUTURE] Screenshot: .arc/ directory structure in an actual project, showing
     the three-tier layout (active/, backlog/, reference/) with real files. -->

ARC provides a preset directory of markdown documents organized into three tiers:

### Active Work (`active/`)

Your current development context:

- **CURRENT-SESSION** — Agent orientation document: what's in progress, what's next,
  uncommitted state. Updated at session boundaries.
- **PRDs and task lists** — Requirements and scoped work broken into reviewable subtasks
  with completion criteria. Organized by type: `feature/`, `technical/`, `incidental/`.
- **ATOMIC-TASKS** — Small one-off items that don't need full task lists.

### Backlog (`backlog/`)

Your planning pipeline:

- **ROADMAP** — Sequencing strategy for upcoming work
- **TASK-INBOX** — Zero-friction capture for ideas (GTD-style inbox)
- **Planning documents** — Rough plans that evolve into structured PRDs

### Reference (`reference/`)

Stable, long-lived project knowledge:

- **Constitution** — Foundational documents anchoring your project:
    - META-PRD (product vision and requirements)
    - TECHNICAL-OVERVIEW (architecture and stack)
    - DEVELOPMENT-RULES (quality standards, commit protocols, collaboration rules)
    - PROJECT-STATUS (current state and progress)
- **Workflows** — Core development processes (PRD creation, task generation, task
  execution loop) and supplemental workflows (session handoff, atomic commits,
  incidental work management, archival)
- **Strategies** — Implementation patterns codified from real usage (testing approach,
  component patterns, authentication, whatever applies to your project)
- **ADRs** — Architecture Decision Records for significant design choices
- **Agent configuration** — Central reference card (AGENTS.md) extended by
  agent-specific files (CLAUDE.md, GEMINI.md, etc.)
- **Archive** — Completed work preserved as searchable project history

## Getting Started

<!-- [PLACEHOLDER] Distribution CLI is in development. These commands represent the
     target installation experience. -->

### Installation

```bash
npx arc-framework init
```

<!-- [FUTURE] Screenshot: interactive init prompts (project type, stack, agent
     selection). -->

The interactive setup asks about your project:

- Project name and type
- Technology stack (populates quality gate commands and relevant examples)
- Solo developer or team (configures workspace structure accordingly)
- Which AI agents you use (installs agent-specific configuration)
- Work organization preferences

This creates a customized `.arc/` directory in your project.

### First Session

<!-- [PLACEHOLDER] The guided setup workflow described here is aspirational. The
     define-constitution workflow exists but a more complete first-run experience
     is planned. -->

1. **Set up your project with your agent** — ARC provides a guided startup workflow
   that you run with your AI agent. Together you walk through the foundational
   documents: what you're building (META-PRD), your architecture (TECHNICAL-OVERVIEW),
   and your development standards (DEVELOPMENT-RULES). The agent helps you fill these
   in based on your project, and the templates provide structure for what goes where.

2. **Plan your first work** — Create a PRD for your first feature or task, then
   generate a task list from it. The workflows guide this process.

3. **Start the core loop** — From here, it's the daily rhythm: session init, work
   through tasks with your review, handoff when done.

### Agent Setup

<!-- [PLACEHOLDER] Agent-specific setup details will depend on distribution system. -->

ARC works with any AI coding agent that can read files and follow instructions. The
framework includes configuration templates for:

- **Claude Code** — slash commands, skills, MCP configuration
- **Codex CLI** — instructions and configuration
- **Gemini CLI** — instructions and configuration
- **GitHub Copilot** — workspace instructions
- **Warp** — AI agent rules

**Important:** Disable auto-compaction / context summarization in your agent if
possible. ARC assumes sessions end with an explicit handoff that preserves state,
not with context degradation that loses constitutional information loaded at session
start.

### Updates

<!-- [PLACEHOLDER] Update mechanism is in development. -->

```bash
npx arc-framework update
```

Updates merge framework improvements into your customized documents using three-way
merge — your customizations are preserved, framework updates apply cleanly where they
don't conflict.

## Document Audiences

ARC documents serve different audiences — understanding this helps you know what to
read and what to leave for your agent:

| Audience           | Documents                                                         | Who reads them                                                                                                               |
|--------------------|-------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| **Agent-executed** | Session init, session handoff, CURRENT-SESSION, process-task-loop | Your AI agent follows these as operational procedures. You don't need to read them in the core loop — only when customizing. |
| **Shared context** | Constitution, strategies, ADRs, roadmap, backlogs, task lists     | Both you and your agent. Establishes the common baseline.                                                                    |
| **Human-facing**   | This README, getting-started materials                            | You, when evaluating or setting up the framework.                                                                            |

When your agent initializes each session, it reads several documents in full —
constitution, development rules, quick reference, current session state. This is by
design: agents start with zero memory and need complete context every time. The reading
list looks heavy, but it's the mechanism that ensures consistent, well-informed agent
behavior session after session.

## How It Works

### Planning Work

When you have a new feature or significant task:

1. **Create a PRD** — Use the PRD workflow to define scope, requirements, and success
   criteria. Start with rough notes if needed — the workflow supports progressive
   refinement.
2. **Generate tasks** — The task generation workflow breaks your PRD into phases and
   subtasks with explicit completion criteria.
3. **Execute** — Enter the core loop. Work through tasks one at a time.

### Session Management

Agents lose all context between sessions. ARC handles this with a pair of workflows:

- **Session initialization** loads complete project context at the start of every
  session: constitutional documents, development rules, current task state.
- **Session handoff** captures everything needed to resume: completed work, uncommitted
  changes, blockers, next actions.
- **CURRENT-SESSION** is the bridge between them, updated at handoff and read at
  initialization.

The result is that each session is independent but informed. No persistent agent
memory required.

### Quality Gates

ARC uses a tiered quality gate system:

- **Tier 1** (per-subtask) — Lint and type-check modified files, run related unit tests
- **Tier 2** (per-parent-task) — Full project lint, type-check, format, unit tests,
  build
- **Tier 3** (per-phase/milestone) — Full test suite including integration/E2E

Quality gate commands are defined in your QUICK-REFERENCE document, customized to your
stack during init.

### Work Organization

Work is categorized by type, not size:

- **Feature** — User-facing functionality (new features, UX changes)
- **Technical** — Infrastructure and internals (refactoring, tooling, performance)
- **Incidental** — Reactive maintenance discovered during other work (bugs, tech debt)

Each type gets its own directory under `active/`, its own branch naming convention,
and follows the same workflow.

## Compatibility

ARC tries to avoid assumptions about your project or tooling:

- **Project type** — Web apps, CLI tools, libraries, data pipelines, monorepos,
  documentation projects. Templates use tokens for stack-specific details that you
  fill in during setup.
- **AI agents** — Framework documents are plain markdown. Any agent that can read
  files and follow instructions can work with ARC. Agent-specific configuration is
  layered on top, not baked in.
- **No runtime dependencies** — Markdown files and Git. That's it.

## Design Principles

- **Single-threaded execution** — One subtask at a time, reviewed before proceeding.
  Keeps work reviewable and keeps you connected to what's changing.
- **Manual commit control** — Agent never commits without explicit developer approval.
- **Shared context** — Constitutional documents give human and agent the same
  understanding of the project.
- **Session continuity** — Structured handoffs preserve state across context boundaries.
  No persistent memory needed.
- **Spec-driven development** — Requirements documented before implementation begins.
  Spec-driven development is an emerging practice; ARC operationalizes it as a
  complete pipeline: PRD to task list to execution to quality gates.
- **Progressive knowledge** — Working notes evolve into strategies; completed work
  archives as searchable history.

## Trade-offs

ARC optimizes for understanding and trust over raw throughput. That comes with costs:

- **Slower than autonomous approaches.** Single-threaded execution with human review
  after every subtask means less gets done per hour than a fully autonomous agent run.
  The bet is that the work that does get done is more likely to be correct, understood,
  and maintainable.
- **Requires active engagement.** This isn't a "set it and forget it" system. The
  developer needs to be present and paying attention. If you want to kick off a task
  and come back to finished code, ARC's core workflow isn't designed for that.
- **Overhead for small projects.** Constitutional documents, session protocols, and
  structured task lists add value proportional to project complexity and duration. For
  a weekend prototype, this is probably more structure than you need.
- **Opinionated about process — but adaptable.** ARC has strong defaults about how
  work should flow. If you fundamentally disagree with tight human-agent coupling or
  structured task execution, it's probably not for you. But within that philosophy,
  the framework is designed to be yours: every document is plain markdown you can
  edit, the update system preserves your customizations through three-way merge, and
  you can add your own workflows, strategies, and quality gates alongside or in place
  of the defaults. Five quality tiers instead of three? Different commit conventions?
  Custom approval gates? The framework accommodates that — and consistency-checking
  workflows help ensure your customizations stay coherent across documents.

## License

ARC Framework is licensed under the Apache License 2.0.
See the [LICENSE](LICENSE) file for details.
