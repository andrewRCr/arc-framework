# CLAUDE.md

Guidance for Claude when working in the ARC framework repository. For shared rules and architecture, defer to the
canonical docs:

- [AGENTS](AGENTS.md) – Project context and collaboration principles
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) v0.3.0-dev (hash: 8c5f2a91) – Non-negotiable standards
- [QUICK-REFERENCE](../QUICK-REFERENCE.md) v0.3.0-dev – Environment context and command patterns
- [Process Task Loop](../../.arc/reference/workflows/3_process-task-loop.md) – One-subtask workflow

## Claude-Specific Notes

- **Session startup:** Execute Session Startup Protocol in CURRENT-SESSION.md first (verify working directory at repo
  root, no runtime containers, markdown linting available)
- **Path awareness:** Commands in QUICK-REFERENCE assume repo root - paths should already be correct
  (documentation-only framework)
- **Summaries first:** Lead responses with concise bullet findings before deep dives
- **Clarifying questions:** Offer numbered/lettered options to keep user replies short
- **Large diffs:** If a change won't fit in context, propose a chunking strategy and wait for approval
- **Session handoffs:** Explicitly state whether CURRENT-SESSION.md was updated or left unchanged
- **Self-hosting:** Framework develops itself using ARC methodology - we are our own test case

## Context Window Management

**Claude-specific token thresholds and monitoring protocol.**

**Context Window:** Claude Code provides ~200,000 token context window. Monitor usage throughout session.

**Monitoring Protocol:**

- Work at full specification until **~140,000 tokens used** (start monitoring context)
- At **~150,000 tokens**, assess situation:
  1. Complete current work item (don't stop mid-edit)
  2. Evaluate remaining work scope
  3. **Stop and ask user** how to proceed: "We're at ~150k tokens. [Summary of completed work]. [Remaining work
     description with estimated token cost]. How should we proceed?"
  4. User decides: continue, commit completed work then continue, or begin handoff
- Token usage displayed in function results - check periodically during long sessions
- **Never** degrade work quality or change approach due to token pressure
- **Never** make "efficiency" tradeoffs based on context window size

**Why these thresholds:**

- 140k: Start monitoring, but continue normal work
- 150k: Proactive check-in with user before hitting limits
- Leaves buffer for commit workflows, quality gates, and session handoff if needed

**See also:** Session Context Management section in DEVELOPMENT-RULES.md for agent-agnostic principles.

## Autonomous Work Mode

**Special case:** This protocol activates ONLY when the user explicitly uses the word "autonomous" in their request.
This is typically invoked via slash command when the user needs to step away briefly.

**Example trigger:**

> "I'm stepping away briefly; please work *autonomously* through tasks as documented in the task list."

**Protocol:**

1. **Work through tasks sequentially** as documented in the active task list
2. **After each task completion:**
   - **Update task list immediately** - mark task `[x]`, add inline completion notes (same as normal flow)
   - Run incremental quality gates (affected files only):
     - Markdown linting on modified files
     - Exception: If the task itself specifies "run full quality gates," do so
   - Assess remaining context capacity:
     - Estimate tokens needed for: potential review edits (~15-20k), atomic commit workflow (~5-10k),
       session handoff (~3-5k)
     - **Target buffer: ~30k tokens remaining**
     - If uncertain whether buffer is sufficient, **pause**
3. **Do NOT start a new task** if uncertain about completing it with buffer intact
4. **When pausing:**
   - Task list should already be updated (per step 2)
   - State: "Paused for review. Completed Tasks X.Y-X.Z. Ready for your review before committing."

**When user returns:**

- Review completed work together
- Make any requested changes
- Run atomic commit workflow (at user's direction)
- Run session handoff workflow (at user's direction)
- **Resume normal workflow** ([3_process-task-loop.md](../../.arc/reference/workflows/3_process-task-loop.md)) — one
  task at a time with check-ins

**Appropriate for:**

- Well-defined task list work with clear subtasks
- Refactoring phases with predictable scope
- Sequential file updates (renames, import updates, etc.)

**NOT appropriate for:**

- Exploratory debugging
- Tasks requiring design decisions
- Work with uncertain scope
- Anything where user input might change direction

**Limitations (be honest):**

- Token estimation is imprecise - err on the side of pausing early
- Complex tasks may consume more tokens than expected
- This is experimental - feedback welcome on tuning the buffer threshold

## Sub-Agent Availability

**External Research Analyst** - Available for web research and external documentation synthesis.

**When to use:**

- ✅ Researching third-party libraries or best practices
- ✅ Investigating security advisories or error messages from external sources
- ✅ Any web research expected to require 3+ WebFetch calls
- ✅ Tasks requiring synthesis across multiple external sources
- ✅ Gathering context about external APIs, frameworks, or tools

**When NOT to use:**

- ❌ Simple 1-2 WebFetch queries with clear targets (use WebFetch directly)
- ❌ Checking a single documentation page
- ❌ Quick lookups of known information

**Why this matters:** The external-research-analyst agent can autonomously perform multiple fetches, synthesize
information, and handle expanding research scope. Using it for broader research tasks is more efficient than
sequential WebFetch calls in the main conversation.
