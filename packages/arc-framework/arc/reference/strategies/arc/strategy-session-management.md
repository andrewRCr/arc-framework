# Strategy: Session Management

**Purpose:** Design rationale and evidence base for ARC's session model. Covers why focused sessions matter, when to end
them, and the shared responsibility model for context monitoring.

**Scope:** Session duration, context quality, and monitoring philosophy. For the session cycle itself (the steps users
follow), see the [session-loop workflow][session-loop]. For agent-executed session procedures, see
[session-init][session-init] and [session-handoff][session-handoff].

---

## Contents

- [Focused Sessions](#focused-sessions) — why ARC uses bounded sessions
- [Context Degradation](#context-degradation) — evidence on quality decline
- [Session Duration Guidance](#session-duration-guidance) — practical thresholds
- [Shared Responsibility Model](#shared-responsibility-model) — who monitors what
- [Auto-Compaction](#auto-compaction) — ARC's stance and reasoning
- [Session State Portability](#session-state-portability) — cross-machine and team scenarios

---

## Focused Sessions

ARC treats sessions as bounded, intentional periods of work — not open-ended conversations that run until interrupted.
This is a design choice grounded in both evidence and philosophy.

**Context quality.** Agent output quality degrades measurably as context accumulates within a session. This is
well-established in the research literature (see [Context Degradation](#context-degradation)) and confirmed by
practitioner experience. Bounded sessions limit degradation by providing reset points where context is deliberately
preserved and then rebuilt fresh.

**Attention quality.** ARC's co-development model (P2) requires sustained human attention — the developer is a
co-developer, not a passive observer. Human attention for novel knowledge work is single-threaded, and task-switching
costs up to 40% of productive time (Rubinstein, Meyer & Evans, 2001). Marathon sessions degrade human judgment the same
way they degrade agent context, just through a different mechanism. See [Core Philosophy][core-philosophy] § Cognitive
Reality for the full reasoning.

**Methodology discipline.** The session boundary enforces the establish-execute-capture rhythm (P5). Each session starts
with deliberate context loading, proceeds through focused work, and ends with intentional state preservation. This
rhythm is what makes context recoverable across work boundaries — without it, knowledge accumulates implicitly and is
lost when the conversation ends.

Focused sessions are not about artificial time limits. They're about maintaining the conditions under which
co-development actually works: fresh context, sustained attention, and intentional state management.

---

## Context Degradation

The evidence that LLM output quality degrades with context length is consistent across academic research, vendor
guidance, and practitioner experience.

**Key findings:**

- **Performance drops are measurable and significant.** Across models and task types, studies report 13.9%-85%
  degradation as context fills, even when models can perfectly retrieve relevant information (Agarwal et al., "[Context
  Length Alone Hurts LLM Performance Despite Perfect Retrieval][ctx-length-hurts]," EMNLP 2025).

- **Effective capacity is well below advertised limits.** Multiple sources converge on 60-70% of advertised context as
  the performance-reliable range. The gap between what a model accepts and what it uses effectively is substantial
  (Hsieh et al., "[RULER: What's the Real Context Size of Your Long-Context Language Models?][ruler]," COLM 2024).

- **Complex tasks degrade faster than simple retrieval.** Simple needle-in-a-haystack retrieval remains high at long
  contexts, but multi-hop reasoning, code generation, and aggregation tasks — the work that dominates development
  sessions — degrade sharply. Agentic reasoning success rates drop from 40-50% baseline to under 10% in long-context
  scenarios (Wang et al., "[Evaluating Long-Context Reasoning in LLM-Based WebAgents][web-agents]," 2025).

- **Position effects are significant.** Information in the middle of long contexts suffers 30%+ performance degradation
  — the "lost in the middle" phenomenon (Liu et al., "[Lost in the Middle: How Language Models Use Long
  Contexts][lost-middle]," TACL 2024). As sessions accumulate history, earlier decisions and context naturally drift
  toward the middle of the window.

This degradation is not a temporary limitation likely to be solved by next-generation models. The evidence spans
multiple model families, architectures, and context window sizes. Larger windows shift where degradation begins; they do
not eliminate it.

---

## Session Duration Guidance

These thresholds are informed by the degradation evidence and practitioner experience. They are guidelines, not hard
rules — adapt to your context.

**General-purpose development work** (task execution, refactoring, feature implementation): monitor context from ~70%
utilization, plan handoff by ~75-80%. This leaves buffer for the handoff workflow itself and aligns with the research
consensus on effective capacity.

**Complex reasoning tasks** (architectural decisions, multi-file refactoring with dependencies, debugging across system
boundaries): consider earlier handoffs at ~60-70% utilization. These tasks are more sensitive to degradation.

**Light tasks** (documentation, simple configuration, single-file edits): can tolerate higher utilization, up to ~85%,
because the reasoning demands are lower and the context is less interconnected.

**Regardless of context utilization:** end the session at natural stopping points — work unit completion, phase
boundaries, clean commit points. A focused session with headroom is better than one that fills the window for marginal
additional work.

**For large context windows** (500K+ tokens): the degradation evidence applies at scale. A 1M token window does not mean
productive 1M token sessions. The same 70-80% effective capacity applies proportionally, and the attention-quality and
methodology-discipline arguments for focused sessions are independent of window size entirely.

---

## Shared Responsibility Model

Context monitoring is a shared responsibility between user and agent, with different roles.

**The user is the primary monitor.** Users have persistent visibility into context usage through platform-provided
indicators — status bars, on-demand commands, threshold warnings. The user decides when to trigger handoff based on
context state, work progress, and judgment about session quality. This is an active responsibility: check periodically,
don't wait for emergencies.

**The agent is the secondary safety net.** Agent-specific configuration files (e.g., CLAUDE.ARC.md) may define
threshold-based check-in behavior — "at ~150k tokens, stop and ask." This catches cases where the user isn't monitoring,
but it's imprecise: agents assess their own token usage approximately, and the check-in interrupts workflow. It's a
fallback, not the designed mechanism.

**Why the user is primary:** The user has better tools for monitoring (platform-native, persistent, accurate), better
judgment about when handoff is appropriate (current work state, commit readiness, remaining task scope), and the
authority to make the call. The agent can flag — the user decides.

ARC recommends disabling auto-compaction where platforms support it. This makes the user's monitoring role explicit: the
platform warns when context is filling, and the user responds by triggering handoff. With auto-compaction enabled, the
platform silently manages context behind the user's back, which conflicts with the intentional session model.

---

## Auto-Compaction

Auto-compaction — where a platform automatically summarizes and compresses conversation history when context fills — is
common across AI development tools. ARC recommends disabling it where possible.

**It's a lossy operation.** Platform compaction summarizes for conversation continuity, not project recovery. It
optimizes for "can the agent keep responding coherently" — not "can a new session reconstruct what happened, why, and
what's left to do." Decisions, debugging context, partial work state, and rationale for approaches tried and abandoned
are exactly the kind of detail that compaction is most likely to drop, and exactly what the session-handoff workflow is
designed to preserve.

**It removes user agency over what's preserved.** The session-handoff workflow exists so that the user (through the
agent) deliberately captures the context that matters: what was completed, what's in progress, what was decided and why,
what to watch out for. Auto-compaction substitutes the platform's statistical judgment for the user's informed judgment
about project-relevant context.

**It undermines session boundaries.** ARC's session model assumes explicit start and end states. Auto-compaction creates
an implicit "session" that never cleanly ends — context degrades gradually, gets silently compressed, and continues. The
establish-execute-capture rhythm that makes context preservation reliable is replaced by an ambient process the user
doesn't control.

**When you can't disable it:** Not all platforms offer the option. In that case, compensate with more frequent commits
(reducing the amount of uncommitted work at risk) and earlier handoffs (capturing state before compaction does).
Understand your platform's compaction behavior — when it triggers, what it preserves, how it signals that compaction
occurred — so you can factor it into your workflow.

---

## Session State Portability

ARC's session state files — SESSION-NOTES.md and other personal workspace content in `user/{identity}/` — are
gitignored by design. This keeps personal context out of git history but creates a portability challenge: session
context doesn't travel with the branch when you switch machines or hand off to a teammate.

### Why portability matters

- **Multi-machine development.** A developer working from a laptop and a desktop needs session context to follow
  the branch, not stay on one machine's filesystem.
- **Team handoff.** When a teammate picks up a branch mid-work, the session context from the previous developer's
  handoff provides essential continuity — what was decided, what was tried, what to watch for.
- **Disaster recovery.** Gitignored files are vulnerable to machine failure or accidental deletion. Session context
  at the end of a long work unit represents accumulated knowledge worth preserving.

### The git notes mechanism

ARC uses [git notes][git-notes] to serialize and transport personal workspace content without polluting git history.
A single notes ref — `refs/notes/arc/user/{identity}` — stores the user directory contents as a note attached to
HEAD at handoff time.

**How it works:**

- **Save** (`arc user save`): Serialize `user/{identity}/` contents to a git note on HEAD
- **Load** (`arc user load`): Restore user directory from git note (on HEAD, walking ancestors if needed)
- **Push/pull** (`arc user push` / `arc user pull`): Transport notes refs to/from remote

Session workflows integrate these automatically: session handoff triggers save + push; session init triggers
pull + load when local files are missing or stale.

**Push policy** (`user.sync_push` in `arc-config.yml`):

- `always` — solo default. Auto-push after save, no friction.
- `prompt` — team default. Conscious choice per handoff.
- `manual` — full control. Push only when explicitly requested.

Per-developer override via `git config arc.sync_push`.

### Scope

Any file in the `user/{identity}/` directory — session notes, inbox items (arc-in-git), personal scratch notes —
travels through one mechanism. New file types added to the user directory are automatically included without
additional plumbing.

---

[session-loop]: ../../../system/workflows/arc/session-lifecycle/session-loop.md
[session-init]: ../../../system/workflows/arc/session-lifecycle/session-init.md
[session-handoff]: ../../../system/workflows/arc/session-lifecycle/session-handoff.md
[core-philosophy]: strategy-core-philosophy.md
[git-notes]: https://git-scm.com/docs/git-notes
[ctx-length-hurts]: https://arxiv.org/abs/2510.05381
[ruler]: https://arxiv.org/abs/2404.06654
[web-agents]: https://arxiv.org/abs/2512.04307
[lost-middle]: https://arxiv.org/abs/2307.03172
