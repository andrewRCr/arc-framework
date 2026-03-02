# CLAUDE.md

Guidance for Claude when working in the ARC framework repository. For shared rules and architecture, defer to the
canonical docs:

- [AGENTS](AGENTS.md) – Project context and collaboration principles
- [DEV-RULES.ARC][dev-rules-arc] – Framework development methodology
- [DEVELOPMENT-RULES][dev-rules] v0.3.0-dev (hash: 8c5f2a91) – Project quality standards
- [QUICK-REFERENCE][quick-ref] v0.3.0-dev – Environment context and command patterns

Before starting task execution, load the [Process Task Loop][process-task-loop].

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
- **Staging verification:** After `git add` and before `git commit`, run `git diff --cached --stat`
  to verify the staging area matches intent. Pre-staged files (from earlier `git rm` or `git add`)
  can silently slip into commits, and intended files can be left out. The pre-commit `git status`
  is orientation (what changes exist); the post-staging check is verification (what am I about to
  commit).

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

**See also:** Session Management section in DEV-RULES.ARC.md for agent-agnostic principles.

## Deferred Review

The [process-task-loop][process-task-loop] normally requires a mandatory stop
after each task for user review. When the user explicitly requests continuation through a specific set of tasks,
that stop is deferred for the specified scope. The user defines the scope — never self-invoke this. See the
process-task-loop "Deferred review" note for the protocol.

**Claude-specific note:** Token introspection is imperfect — err on the side of completing fewer tasks rather
than risking insufficient context for review, iteration, commits, and session handoff when the user returns.

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

---

[dev-rules-arc]: ../../../.arc/reference/constitution/DEV-RULES.ARC.md
[dev-rules]: ../../reference/constitution/DEVELOPMENT-RULES.md
[quick-ref]: ../../reference/QUICK-REFERENCE.md
[process-task-loop]: ../../../.arc/system/workflows/arc/3_process-task-loop.md
