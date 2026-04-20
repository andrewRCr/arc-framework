---
purpose: Authoritative reference for the ARC session cycle — bounded, intentional periods with explicit start and end.
audience: human
---

# Workflow: Session Loop

Sessions are bounded, intentional periods of agent-assisted work with explicit start and end states.
This document describes the cycle the user drives; [session-init][session-init] and
[session-handoff][session-handoff] are the agent-executed workflows within it.

**Principles:** P5 (Context Preservation), P3 (Focused Sequential Execution), P2 (Co-Development)

---

## The Session Cycle

Each session follows the same rhythm: establish context, co-develop, preserve state, reset.

1. **Start a fresh session.** Open a new conversation or cleared context — no residual state from prior work. The
   platform mechanism varies (new conversation, `/clear`, fresh terminal session).

2. **Initialize.** Trigger the [session-init workflow][session-init]. The agent loads project context, verifies the
   environment, and presents an orientation summary with active work state and next action. Invoke via skill trigger
   (e.g., `/arc-resume`) or conversational request.

3. **Co-develop.** Work with the agent — task execution, planning, investigation, whatever the session requires. Commit
   at your own pace throughout, via skill trigger (e.g., `/arc-commit`) or conversational request. The agent works one
   review increment at a time per [DEV-RULES.ARC][dev-rules-arc] § Task Execution.

4. **Hand off.** When the session should end (see [When to End a Session](#when-to-end-a-session)), trigger the
   [session-handoff workflow][session-handoff]. The agent captures work state, session notes, and any unfinished
   context. Committing before handoff is recommended but at your discretion. Invoke via skill trigger (e.g.,
   `/arc-handoff`) or conversational request.

5. **Clear and repeat.** After handoff is complete and you've received the session summary, clear the conversation or
   context. Return to step 1.

The skill triggers (`/arc-resume`, `/arc-commit`, `/arc-handoff`) are ARC's intended invocation mechanism — they make
the common workflow mechanical and consistent. Conversational requests accomplish the same thing; the skills just remove
ambiguity.

---

## When to End a Session

Three triggers signal that a session should end. Any one is sufficient.

### Approaching context limits

Your platform will signal when context is running low — through persistent indicators, on-demand commands, or threshold
warnings. When you see that signal, wrap up your current work item and trigger handoff. Don't push to the limit; leave
room for the handoff workflow itself.

**Context monitoring is primarily the user's responsibility.** You have persistent visibility into context usage through
your platform's reporting. Agent self-monitoring (threshold-based check-ins configured in agent-specific files) is a
secondary safety net, not the primary mechanism — agents assess their own token usage imprecisely.

### Quality degradation

Context quality degrades before context runs out. Complex reasoning tasks — the kind that dominate development work —
show measurable quality decline well before hard platform limits. The [Session Operations
Strategy][session-ops-strategy] covers the evidence and thresholds in detail, but the practical guidance is
straightforward: if you notice the agent producing lower-quality output, losing track of prior decisions, or requiring
more correction than earlier in the session, end the session rather than pushing through. A fresh session with good
context recovery outperforms a degraded session with more raw history.

### Natural stopping points

Complete a work unit, finish a logical phase, reach a clean commit point with no immediate next step — these are natural
session boundaries regardless of context state. Shorter, focused sessions with intentional handoffs produce better
results than marathon sessions, even when context permits continuation. See [Session Operations
Strategy][session-ops-strategy] § Focused Sessions for the reasoning.

---

## Platform Considerations

### Auto-compaction

Some platforms automatically compact (summarize and compress) conversation history when context fills. Where your
platform allows it, **disable auto-compaction.** Two reasons:

- **Lossy operation.** Platform compaction is a black-box summarization optimized for conversation continuity, not
  project context. It has no knowledge of what matters for your project's recovery.
- **Removes user agency.** The session-handoff workflow exists so that *you* control what context is preserved —
  decisions, approach, blockers, partial work state. Auto-compaction substitutes the platform's judgment for yours.

With auto-compaction disabled, the context-limit warning becomes your handoff trigger: you see the warning, finish
current work, run handoff, clear, restart. This gives you full control over the session lifecycle.

When you can't disable auto-compaction, factor it into your workflow: the platform may silently reset context
mid-session, so consider more frequent commits and earlier handoffs to reduce the impact.

### Context monitoring tools

Familiarize yourself with your platform's context visibility:

- **Persistent indicators** — status bars, footer displays showing utilization percentage
- **On-demand commands** — commands that report current context usage on request
- **Threshold warnings** — automatic alerts when context approaches limits

Use whatever your platform provides. The key habit is checking periodically, not waiting for warnings.

---

[session-init]: session-init.md
[session-handoff]: session-handoff.md
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[session-ops-strategy]: ../../../../reference/strategies/arc/strategy-session-operations.md
