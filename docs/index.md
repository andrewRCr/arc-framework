# ARC Framework

ARC is a structured methodology for spec-driven development with AI agents, emphasizing disciplined
collaboration over automation. Implemented as portable markdown documents and a CLI, it's built on
the premise that better outcomes come from deliberately coupling human judgment with agent capability,
not separating them through delegation. Agentic task execution is intentionally single-threaded —
work scoped into discrete [review increments](reference/glossary.md#review-increment) that are small
enough to review meaningfully, with active developer involvement creating a tight feedback loop that
leverages complementary strengths, favoring iterative
[co-development](reference/glossary.md#co-development) over raw throughput. The framework unifies
planning, execution, and context preservation in a single system that works with any conversational
AI coding agent and any tech stack.

ARC is grounded in cognitive science research on sustained attention and emerging AI research on
context quality degradation — [Philosophy](philosophy.md) covers the evidence base.
If you're ready to use it, [Getting Started](getting-started.md) walks through installation and your
first session. If you want to understand the operational model first,
[How ARC Works](how-arc-works.md) covers the session lifecycle, skills, and task execution rhythm.

## How ARC Works

ARC lives in an `.arc/` directory in your repository. The documents inside aren't passive reference
material — they're mechanical. Workflows branch on configuration values, methods define overridable
contracts at specific trigger points, extension points inject custom behavior at workflow boundaries,
and git hooks enforce conventions deterministically at commit time.

ARC packages its user-facing workflows as **[Skills](https://agentskills.io)** — an open standard
format for giving agents new capabilities. Each ARC skill is a user-invoked entry point for a key
operational workflow: when to start a session, when to commit, when to hand off. Three skills form
the operational rhythm: `arc-resume` (start), `arc-commit` (commit changes), and `arc-handoff` (end). The
invocation syntax varies by platform (slash commands in Claude Code, `$` prefix in Codex CLI), but
the concept is the same. The agent's other workflows — task execution, quality gates, planning —
load automatically as part of the ARC instruction chain once a session is running.

### Sessions

Work happens in bounded sessions. Each session starts with structured initialization: the agent loads
project briefing documents, development rules, strategy guidance, active work status, and personal
session notes from the last handoff — in a defined order, with foundational context first and
procedural content loaded on-demand as work triggers it.

Sessions end with a structured handoff that captures working state: what was completed, what's next,
decisions made, and anything the next session needs to know. State splits between two files —
WORK-STATUS.md (tracked, committed) carries the factual project pointer that anyone on the branch can
see, while SESSION-NOTES.md (personal, gitignored) carries working context like approach decisions,
things tried, and known risks. Git notes make session state portable across machines without creating
merge conflicts.

This bounded lifecycle is a direct response to research showing that LLM output quality degrades
measurably as context accumulates — and that human attention for sustained knowledge work follows the
same pattern through different mechanisms. Focused sessions that reset at natural boundaries maintain
higher quality than marathon ones that technically fit in the context window.

[Learn more about the session lifecycle &rarr;](how-arc-works.md)

### Task Execution

Planned work follows a pipeline: ideas become plan documents, plan documents become PRDs (product
requirements documents), and PRDs generate structured task lists. Each task in a task list is a
*review increment* — a bounded chunk of autonomous execution between human review points.

The agent completes one task, runs quality gates on modified files, marks it complete, reports the
result, and stops. The developer reviews, contributes context, and approves before the next task
begins. This isn't review-after-the-fact — the developer is present during execution, steering
direction and catching issues while the work is happening.

Quality gates are tiered: incremental checks per-task (Tier 1), integration checks at coherent unit
boundaries (Tier 2), and the full suite at phase completion or before a PR (Tier 3). Gate commands
are project-specific — you define what "quality" means for your stack.

[Learn more about work planning &rarr;](work-planning.md)

### Configurability

ARC has 11 non-negotiable principles that define its identity, and a set of configurable conventions
that implement those principles. The principles are what make ARC *ARC*. The conventions are strong
defaults your team replaces when they don't fit.

Three mechanisms handle customization:

- **Configuration** (`arc-config.yml`) — values that affect behavior: branch protection mode, commit
  format enforcement, hook settings, merge strategy, project management mode.
- **Method overrides** (`arc-methods.md`) — replace *how* ARC does something. Each method defines a
  contract and a default implementation. Your team supplies an alternative that satisfies the same
  contract. Commit format, issue triage thresholds, test-first decision trees, quality gate commands,
  and session state mechanics are all overridable methods.
- **Extension points** (`arc-extensions.md`) — inject additional steps at workflow boundaries.
  Post-task quality checks, post-context-load document loading, pre-merge review ceremony. Extensions
  add behavior without replacing existing steps.

Beyond these mechanisms, teams create their own project strategies, domain-specific development rules,
and project workflows that live alongside ARC's framework files and carry the same weight when the
agent is working in that domain.

[Learn more about configuration &rarr;](reference/configuration.md)

## The CLI

The [`@arc-framework/cli`](https://www.npmjs.com/package/@arc-framework/cli) package manages the ARC
lifecycle:

- **`arc init`** — initialize ARC in a project (documents, git hooks, agent skills).
  `arc init --reconfigure` to change structural settings later.
- **`arc join`** — join an existing ARC project (role, identity, agent skills).
  `arc join --reconfigure` to change personal settings.
- **`arc update`** — update framework files via three-way merge, preserving your customizations.
  File classifications (Framework, Configurable, Scaffolded) determine what gets updated, what gets
  merged, and what's left alone.
- **`arc user sync`** — session state portability via git notes.

[Learn more about updating ARC &rarr;](updating.md)

## Documentation Guide

| Section                               | What You'll Find                                                               |
|---------------------------------------|--------------------------------------------------------------------------------|
| [Getting Started](getting-started.md) | Install ARC, run your first session, understand what happened                  |
| [How ARC Works](how-arc-works.md)     | The session lifecycle, skills, task execution rhythm, and state management     |
| [Philosophy](philosophy.md)           | The 11 principles, cognitive science and AI research, and where ARC fits       |
| [Work Planning](work-planning.md)     | The planning pipeline from idea to task list, how tasks execute, quality gates |
| [Updating ARC](updating.md)           | What `arc update` does, file classifications, what's safe to edit              |
| [Reference](reference/index.md)       | Configuration, quality gate tiers, skills, team coordination, glossary         |
| [FAQ](faq.md)                         | Common questions about ARC's design choices, agent compatibility, and usage    |
| [Contributing](contributing.md)       | How to contribute to ARC — setup, commit conventions, quality standards        |
