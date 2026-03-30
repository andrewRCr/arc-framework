# Sessions

ARC treats sessions as bounded, intentional periods of work — not open-ended conversations that run
until interrupted. Each session starts with structured initialization, proceeds through focused work,
and ends with intentional state preservation.

This isn't an artificial constraint. It's a response to concrete evidence about how both agent and
human performance degrade over time, and a mechanism for keeping context recoverable across the
inherent boundary of ephemeral agent conversations.

## Why Bounded Sessions

Three forces converge on the same design choice.

**Agent context quality degrades measurably.** LLM output quality drops as context accumulates
within a session. Studies report 13.9–85% degradation across models and task types, even when models
can perfectly retrieve relevant information (Agarwal et al., EMNLP 2025). Effective capacity
converges around 60–70% of the advertised context window (Hsieh et al., COLM 2024). Complex
tasks — multi-hop reasoning, code generation, agentic workflows — degrade faster than simple
retrieval, with agentic success rates dropping from 40–50% baseline to under 10% in long-context
scenarios (Wang et al., 2025). Information in the middle of long contexts suffers 30%+ performance
loss — the "lost in the middle" phenomenon (Liu et al., TACL 2024).

This is not a temporary limitation. The evidence spans multiple model families, architectures, and
context window sizes. Larger windows shift where degradation begins; they don't eliminate it.

**Human attention follows the same pattern.** ARC's [co-development model](philosophy.md#core-commitments)
requires sustained developer attention — the developer is a co-developer, not a passive observer.
Task-switching costs up to 40% of productive time, and interruption recovery takes 10–15 minutes for
software engineering work. Marathon sessions degrade human judgment the same way they degrade agent
context, through a different mechanism.

**Session boundaries enforce methodology discipline.** The establish-execute-capture rhythm is what
makes context recoverable. Each session starts with deliberate context loading and ends with
intentional state preservation. Without explicit boundaries, knowledge accumulates implicitly and is
lost when the conversation ends.

## How Sessions Work

### Initialization

The agent loads a defined set of documents in a specific order:

1. **Project identity** — agent briefing documents (framework orientation, project overview)
2. **Constitutional context** — development rules, strategy index, quick reference
3. **Active work state** — WORK-STATUS.md (current task, blockers, next action)
4. **Personal context** — SESSION-NOTES.md from the last handoff (if available)
5. **Task context** — current task details from the active task list
6. **Procedural content** — task execution workflow (loaded conditionally when active task work
   exists)

Foundational context loads first. Procedural workflows and reference material load on-demand as work
triggers them. This [tiered delivery](index.md#how-arc-works) keeps the agent's context focused on
what's immediately relevant.

### Work execution

During a session, the developer and agent work through tasks following the
[task execution model](work-planning.md#how-tasks-execute). The session lifecycle provides the
container; the planning and execution system provides the structure within it.

### Handoff

When a session ends — at a natural boundary, when context is filling, or when the developer decides
to stop — a structured handoff captures working state:

- **WORK-STATUS.md** is updated with the current task pointer, blockers, and next action. This is
  tracked (committed to git) and visible to anyone on the branch.
- **SESSION-NOTES.md** captures personal working context: what was completed, decisions made,
  things tried, known risks, and anything the next session needs to know. This is gitignored —
  personal to the developer, not part of the project record.

The split is deliberate. WORK-STATUS tells any developer (or agent) where the project stands.
SESSION-NOTES tells *this* developer what they were thinking.

Here's what each looks like after a handoff:

**WORK-STATUS.md** (tracked, committed):

```markdown
**Branch**: `feature/recurring-tasks`
**Task List**: `.arc/active/feature/tasks-recurring-tasks.md`
**Next Task**: Task 1.3 — Wire recurrence into task completion endpoint
**Last Completed**: Task 1.2 — Create recurrence service
**Blockers**: None
**Next Action**: Implement completion hook that triggers RecurrenceService.createNext()
```

**SESSION-NOTES.md** (personal, gitignored):

```markdown
## Completed Work

- Tasks 1.1–1.2 done and committed. Schema migration clean, service tested.
- Chose cron-parser over node-cron — lighter, parse-only (no scheduling needed).

## Additional Context

- The completion endpoint currently fires a webhook after status change.
  Recurrence creation should hook into the same event, not add a second
  code path. Check `TaskController.complete()` → `webhookService.notify()`.
- Consider: should recurrence auto-create even if the task was completed
  late? Decided yes for now — revisit if users request "skip overdue."
```

## Session Duration

These thresholds are informed by the degradation evidence and practitioner experience. They're
guidelines, not hard rules.

- **General development** (task execution, refactoring, features): monitor context from ~70%
  utilization, plan handoff by ~75–80%.
- **Complex reasoning** (architecture decisions, multi-file refactoring, cross-system debugging):
  consider earlier handoffs at ~60–70%.
- **Light tasks** (documentation, configuration, single-file edits): can tolerate up to ~85%.
- **Large context windows** (500K+ tokens): the same proportional thresholds apply. A 1M token
  window doesn't mean productive 1M token sessions.

Regardless of utilization, end sessions at natural stopping points — task completion, phase
boundaries, clean commit points. A focused session with headroom is better than one that fills the
window for marginal additional work.

## Context Monitoring

Context monitoring is a shared responsibility. The developer is the primary monitor — they have
better tools (platform-native status indicators), better judgment (current work state, commit
readiness), and the authority to call handoff. The agent is a secondary safety net, flagging when
thresholds are approached.

## Session State Portability

SESSION-NOTES.md and other personal workspace files are gitignored by design — personal context
stays out of git history. ARC uses [git notes](https://git-scm.com/docs/git-notes) to make this
state portable without polluting the commit log.

- **Save** (`arc user save`) — serialize the user directory to a git note on HEAD
- **Load** (`arc user load`) — restore from git note, walking ancestors if needed
- **Push/pull** (`arc user push/pull`) — transport notes to/from remote

This handles multi-machine development (session context follows the branch), team handoff (a
teammate can load your session notes when picking up a branch), and disaster recovery (gitignored
files are backed up in git notes).

Push behavior is configurable: `always` (solo default — no friction), `prompt` (team default —
conscious choice per handoff), or `manual` (full control).
