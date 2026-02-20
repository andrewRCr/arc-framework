# CLAUDE.md

Guidance for Claude when working in this repository. For shared rules and architecture, defer to the canonical docs:

- [AGENTS](AGENTS.md) – Project context and collaboration principles
- [DEVELOPMENT-RULES](../../reference/constitution/DEVELOPMENT-RULES.md) – Non-negotiable standards
- [QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md) – Environment context and command patterns
- [Process Task Loop](../workflows/arc/3_process-task-loop.md) – One-task workflow

## Claude-Specific Notes

- **Session startup:** Execute the session initialization workflow (`session-init.md`) first (verify
  working directory, runtime environment, tool availability, paths)
- **Path awareness:** Commands in QUICK-REFERENCE assume repo root — adjust based on current working
  directory from Session Startup Protocol
- **Summaries first:** Lead responses with concise bullet findings before deep dives
- **Clarifying questions:** Offer numbered/lettered options to keep user replies short
- **Large diffs:** If a change won't fit in context, propose a chunking strategy and wait for approval
- **Bash commands:** Keep shell commands simple and separate — chained commands (`&&`, `||`, pipes)
  may not match auto-approve patterns even when the individual commands would be approved. Run
  independent commands as parallel tool calls instead of chaining them.
- **Session handoffs:** Explicitly state whether CURRENT-SESSION.md was updated or left unchanged

## Context Window Management

**Claude-specific token thresholds and monitoring protocol.**

**Context Window:** Claude Code provides ~200,000 token context window. Monitor usage throughout session.

**Monitoring Protocol:**

- Work at full specification until **~140,000 tokens used** (start monitoring context)
- At **~150,000 tokens**, assess situation:
  1. Complete current work item (don't stop mid-edit)
  2. Evaluate remaining work scope
  3. **Stop and ask user** how to proceed: "We're at ~150k tokens. [Summary of completed work].
     [Remaining work description with estimated token cost]. How should we proceed?"
  4. User decides: continue, commit completed work then continue, or begin handoff
- Token usage displayed in function results — check periodically during long sessions
- **Never** degrade work quality or change approach due to token pressure
- **Never** make "efficiency" tradeoffs based on context window size

**Why these thresholds:**

- 140k: Start monitoring, but continue normal work
- 150k: Proactive check-in with user before hitting limits
- Leaves buffer for commit workflows, quality gates, and session handoff if needed

**See also:** Session Context Management section in DEVELOPMENT-RULES.md for agent-agnostic principles.

## Deferred Review

The [process-task-loop](../workflows/arc/3_process-task-loop.md) normally requires a mandatory stop
after each task for user review. When the user explicitly requests continuation through a
specific set of tasks, that stop is deferred for the specified scope. The user defines the
scope — never self-invoke this. See the process-task-loop "Deferred review" note for the protocol.

**Claude-specific note:** Token introspection is imperfect — err on the side of completing fewer
tasks rather than risking insufficient context for review, iteration, commits, and session handoff
when the user returns.

## MCP Server Availability

<!-- Document MCP servers configured for your project. This helps Claude understand -->
<!-- what tools are available without needing to discover them at runtime. -->

**Project-enabled MCPs (always available):**

- {{MCP server}} - {{what it provides}}

**Available but disabled by default (request if needed):**

<!-- MCPs that consume significant tokens when enabled. Claude should ask before using these. -->

- {{MCP server}} - {{what it provides}}

## Sub-Agent Availability

<!-- Document sub-agents available in your Claude Code setup. Sub-agents can handle -->
<!-- specialized tasks autonomously, saving main conversation context. -->

**{{Agent Name}}** - {{brief description of capability}}.

**When to use:**

- {{Use case where the agent adds value}}
- {{Another use case}}

**When NOT to use:**

- {{Case where direct tool use is more efficient}}
- {{Another case}}
