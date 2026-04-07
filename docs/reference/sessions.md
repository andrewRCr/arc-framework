# Sessions & Context

ARC sessions are bounded by design — not because of technical limits, but because output quality
degrades measurably as context accumulates. Focused sessions with intentional handoffs produce
better work than marathon sessions, even when the context window technically permits continuation.

For the session lifecycle (starting, working, committing, ending) and state portability, see
[The Framework](../the-framework.md#the-session-lifecycle). This page covers the evidence and
design reasoning behind ARC's session model, the context loading architecture, and practical
guidance for monitoring session health. For operational specifications, see
`strategy-session-management.md` and `strategy-context-loading.md` in your
`.arc/reference/strategies/` directory.

## Why Bounded Sessions

Three forces converge to make bounded sessions better than open-ended ones:

**Context quality.** Agent output quality degrades as context accumulates — this is consistent
across models, architectures, and window sizes (see evidence below). Bounded sessions limit
degradation by providing reset points where context is preserved and rebuilt fresh.

**Attention quality.** ARC's [co-development](glossary.md#co-development) model requires
sustained human attention. Human attention for novel knowledge work is single-threaded, and
task-switching costs up to 40% of productive time. Marathon sessions degrade human judgment the
same way they degrade agent context — through a different mechanism, with the same effect.

**Methodology discipline.** The session boundary enforces ARC's establish-execute-capture rhythm.
Each session starts with deliberate context loading, proceeds through focused work, and ends with
intentional state preservation. Without this rhythm, knowledge accumulates implicitly and is lost
when the conversation ends.

??? info "Context degradation evidence"

    The evidence that LLM output quality degrades with context length is consistent across
    academic research, vendor guidance, and practitioner experience.

    - **Performance drops are measurable.** Studies report 13.9%–85% degradation as context fills,
      even with perfect retrieval (Agarwal et al.,
      "[Context Length Alone Hurts LLM Performance Despite Perfect Retrieval](https://arxiv.org/abs/2510.05381),"
      EMNLP 2025).

    - **Effective capacity is below advertised limits.** Multiple sources converge on 60–70% of
      advertised context as the performance-reliable range (Hsieh et al.,
      "[RULER: What's the Real Context Size of Your Long-Context Language Models?](https://arxiv.org/abs/2404.06654),"
      COLM 2024).

    - **Complex tasks degrade faster.** Simple retrieval remains high at long contexts, but
      multi-hop reasoning and code generation degrade sharply. Agentic reasoning success rates
      drop from 40–50% baseline to under 10% in long-context scenarios (Wang et al.,
      "[Evaluating Long-Context Reasoning in LLM-Based WebAgents](https://arxiv.org/abs/2512.04307),"
      2025).

    - **Position effects matter.** Information in the middle of long contexts suffers 30%+
      degradation — the "lost in the middle" phenomenon (Liu et al.,
      "[Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172),"
      TACL 2024). As sessions accumulate history, earlier guidance drifts toward weaker retrieval
      positions.

    This is not a temporary limitation. The evidence spans multiple model families, architectures,
    and window sizes. Larger windows shift where degradation begins; they do not eliminate it.

## Session Duration

These thresholds are informed by the degradation evidence and practitioner experience — guidelines,
not hard rules.

**General development work** (task execution, refactoring, feature implementation): monitor
context from ~70% utilization, plan handoff by ~75–80%. This leaves buffer for the handoff
workflow and aligns with research on effective capacity.

**Complex reasoning** (architectural decisions, multi-file refactoring, cross-system debugging):
consider earlier handoffs at ~60–70%. These tasks are more sensitive to degradation.

**Light tasks** (documentation, configuration, single-file edits): can tolerate higher
utilization, up to ~85%, because reasoning demands are lower.

**Large context windows** (500K+ tokens): the same proportional thresholds apply. A 1M token
window does not mean productive 1M token sessions — and the attention-quality and
methodology-discipline arguments are independent of window size entirely.

**Regardless of utilization:** end at natural stopping points — task completion, phase boundaries,
clean commit points. A focused session with headroom is better than one that fills the window for
marginal additional work.

## Context Loading

When a session starts, the agent doesn't load everything at once. ARC organizes context into
three tiers based on when content becomes relevant:

| Tier | Name           | When Loaded              | Examples                                            |
| ---- | -------------- | ------------------------ | --------------------------------------------------- |
| T1   | Constitutional | Session start            | Dev rules, agent briefings, config, strategy index  |
| T2   | State          | Session start            | WORK-STATUS, session notes, current task            |
| T3   | Procedural     | On-demand during work    | Method defaults, strategies, detailed workflows     |

T1 and T2 load upfront because they govern all behavior and orient the agent. T3 loads when the
agent reaches the relevant workflow step — a task execution method loads when the agent starts
executing tasks, not during a planning-only session where it would waste context.

This matters because **not all context costs the same**. Reference material (config values,
command patterns) sits passively — low cost. Behavioral principles (dev rules, collaboration
context) require moderate attention. But procedural instructions (decision trees, step-by-step
protocols) demand active instruction-following and consume disproportionate context capacity. A
50-line decision tree costs more attention than a 100-line reference table.

The tiered model puts expensive procedural content on-demand, keeping the session's working
context focused on what's immediately relevant.

## Monitoring Responsibility

Context monitoring is shared between you and the agent, with distinct roles.

**You are the primary monitor.** You have persistent visibility into context usage through
platform-provided indicators (status bars, warnings, on-demand commands). You decide when to
trigger handoff based on context state, work progress, and your judgment about session quality.
Check periodically — don't wait for emergencies.

**The agent is a safety net.** Agent configuration may define threshold-based check-ins (e.g.,
"at ~150K tokens, stop and ask"). This catches cases where you aren't monitoring, but it's
imprecise: agents assess their own token usage approximately, and the interruption breaks flow.
It's a fallback, not the primary mechanism.

## Auto-Compaction

Some platforms automatically summarize conversation history when context fills. ARC recommends
disabling this where possible.

Auto-compaction is a lossy operation optimized for conversation continuity ("can the agent keep
responding?"), not project recovery ("can the next session reconstruct what happened and why?").
Decisions, debugging context, partial work state, and rationale for abandoned approaches are
exactly what compaction drops — and exactly what ARC's handoff workflow preserves.

It also removes your agency over what's preserved, and undermines session boundaries by creating
an implicit "session" that never cleanly ends.

**When you can't disable it:** compensate with more frequent commits (reducing uncommitted work at
risk) and earlier handoffs (capturing state before compaction does). Understand your platform's
compaction behavior — when it triggers, what it preserves, how it signals — so you can factor it
into your workflow.
