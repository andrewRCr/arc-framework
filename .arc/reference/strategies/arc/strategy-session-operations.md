# Strategy: Session Operations

> **Evidence base and rationale:** [Sessions & Context](https://andrewrcr.github.io/arc-framework/reference/sessions/)
> on the docs site covers degradation evidence, duration guidance, instruction density concepts,
> tier rationale, monitoring responsibilities, and auto-compaction reasoning.

Operational specification for context loading and session management in ARC. Covers the tiered
context model, loading mechanisms, context monitoring, and session state portability. For the
session lifecycle workflows, see [session-init][session-init], [session-handoff][session-handoff],
and [session-loop][session-loop].

---

## Contents

- [Context Loading Model](#context-loading-model) — three-tier classification
- [Classification Criteria](#classification-criteria) — which tier for new content
- [Loading Mechanisms](#loading-mechanisms) — how each tier enters agent context
- [Method and Extension Loading](#method-and-extension-loading) — on-demand procedural content
- [Context Monitoring](#context-monitoring) — shared responsibility model
- [Auto-Compaction](#auto-compaction) — operational guidance
- [Session State Portability](#session-state-portability) — cross-machine and team scenarios

---

## Context Loading Model

ARC organizes agent context into three tiers based on when the content becomes relevant:

| Tier | Name           | When Loaded                          | Content Type                                              |
|------|----------------|--------------------------------------|-----------------------------------------------------------|
| T1   | Constitutional | Session initialization               | Principles, identity, constraints, navigation             |
| T2   | State          | Session initialization               | Work status, session notes, task overview                 |
| T3   | Procedural     | On-demand at workflow trigger points | Method defaults/overrides, strategies, detailed workflows |

**T1 — Constitutional.** Content that governs all agent behavior regardless of the session's
work. Always loaded at session start.

- AGENT-BRIEFING.ARC.md (ARC framework orientation)
- AGENT-BRIEFING.PROJECT.md (project identity and collaboration context)
- Agent-specific file (operational guidance)
- DEV-RULES — ARC and Project (quality standards, methodology rules)
- STRATEGY-INDEX — both framework and project (navigation to domain guidance)
- QUICK-REFERENCE (environment context, command patterns)
- arc-config.yml (project settings)

**T2 — State.** Content that orients the agent — where work stands, what happened last session,
what comes next. Always loaded at session start.

- status-{name}.md (per-WU tracked project pointer in active/{category}/; holds State, Branch,
  Task List, Next Task, Last Completed, Blockers, Next Action)
- SESSION-NOTES.md (personal session context from prior handoff)
- Task list overview and current task section (strategic partial read)

**T3 — Procedural.** Step-by-step guidance for specific activities that may or may not happen in
a given session. Loaded on-demand when the agent enters the relevant workflow phase.

- arc-methods defaults and overrides (decision trees, format specs, classification rubrics)
- Strategy documents (domain-specific patterns and guidance)
- Workflow documents (prepare-commits, integrate-work-unit)
- arc-extensions steps (post-task-quality, pre-merge-review, etc.)

### State-Conditional Promotion

Some T3 content becomes near-certain to be needed based on session state available at init time.
Content meeting these criteria promotes from T3 to the session-init load set:

| Content           | State Signal                                        | Promotes When             |
|-------------------|-----------------------------------------------------|---------------------------|
| process-task-loop | Status file resolved; `**Task List:**` not `[none]` | Active task work expected |

Sessions without active task lists (planning, evaluation, exploratory) don't need ~240 lines of
dense procedural content. The state signal loads it precisely when relevant.

---

## Classification Criteria

When adding new content to ARC — strategy docs, method overrides, extensions, workflow
guidance — classify it by asking:

**T1 — Constitutional?**

- Would violating this without knowing it cause incorrect behavior across *any* session activity?
- Is this a constraint, principle, or navigation index that applies regardless of task type?
- Would deferring this create a risk of the agent acting contrary to project standards?

**T2 — State?**

- Does the agent need this to orient itself — to know where work stands and what comes next?
- Is this anchored to the current moment (branch, task, blockers) rather than general guidance?

**T3 — Procedural?**

- Is this guidance for a specific activity that may or may not happen this session?
- Does it have a natural trigger point — a workflow step, a task marker, a domain entry?
- Could an agent work correctly without this until reaching the relevant activity?

**When uncertain, prefer T1.** The cost of loading unnecessary constitutional content is wasted
tokens; the cost of missing it is incorrect behavior.

---

## Loading Mechanisms

Each tier has established mechanisms for how content enters agent context:

### Session initialization (T1 + T2)

The [session-init workflow][session-init] prescribes upfront loading of constitutional and state
documents in a defined order. This is a bulk load — deterministic, ordered, and complete before
work begins. The load order (general → specific) ensures each document is understood in the
context of what came before.

### Workflow-embedded directives (T3)

Workflow documents contain explicit loading instructions for the methods and references they
depend on. When the agent reaches a workflow step that references a method or strategy, the
workflow tells it to load the relevant section.

Directives appear as a method dependencies block near the top of workflow documents:

> **Method dependencies (load on first reference):** [method-a], [method-b]. For each, check
> `.override` first; use `.default` if no override is configured.

This mechanism is deterministic (the workflow prescribes it), automatic (the agent follows the
workflow step by step), and scoped (only the relevant methods load, only when needed).

### Strategy-index triggers (T3)

DEV-RULES instructs agents to check the [Strategy Index][strategy-index] before working in
codified domains. The index serves as a T1 navigation layer (always loaded) that points to T3
strategy content (loaded on-demand). Each entry includes "Consult when:" triggers so agents can
determine relevance without loading the full document.

### User-invocable skills (T3)

Skills (arc-resume, arc-commit, arc-handoff) are user-initiated triggers that load thin guidance
layers and reference T3 workflows. These cover session lifecycle events where the user explicitly
initiates the activity.

---

## Method and Extension Loading

### arc-methods.md

Session initialization scans arc-methods.md for override *presence* only — which methods have
active overrides. The agent does not read `.default` or `.override` content at init. It produces
a brief index: "Methods with overrides: [list]" or "all methods at defaults."

Method content loads on-demand when the agent reaches a workflow step that references the method.

**Method classification by trigger:**

| Method                | Trigger Workflow    | Session Applicability                      |
|-----------------------|---------------------|--------------------------------------------|
| issue-triage          | process-task-loop   | Universal — every task execution session   |
| quality-gate-commands | process-task-loop   | Universal — every task execution session   |
| test-first            | process-task-loop   | Conditional — tasks with test-first marker |
| commit-format         | prepare-commits     | User-triggered commit events               |
| commit-context-format | prepare-commits     | User-triggered commit events               |
| pre-merge-review      | integrate-work-unit | Integration phase only                     |
| review-triage         | integrate-work-unit | Integration phase only                     |
| session-state         | session-handoff     | Session end only                           |

### arc-extensions.md

Extensions are architecturally on-demand — workflows check their specific extension section at
the fire point, not at session init. The process-task-loop checks `post-task-quality` after task
completion; the integrate-work-unit workflow checks `pre-merge-review` before merging.

---

## Context Monitoring

Context monitoring is a shared responsibility between user and agent.

**The user is the primary monitor.** Users have persistent visibility into context usage through
platform-provided indicators — status bars, on-demand commands, threshold warnings. The user
decides when to trigger handoff based on context state, work progress, and judgment about session
quality. This is an active responsibility: check periodically, don't wait for emergencies.

**The agent is the secondary safety net.** Agent-specific configuration files (e.g.,
CLAUDE.ARC.md) may define threshold-based check-in behavior — "at ~150k tokens, stop and ask."
This catches cases where the user isn't monitoring, but it's imprecise: agents assess their own
token usage approximately, and the check-in interrupts workflow. It's a fallback, not the
designed mechanism.

**Monitoring thresholds:**

- General development: monitor from ~70% utilization, plan handoff by ~75-80%
- Complex reasoning: consider earlier handoffs at ~60-70%
- Light tasks: can tolerate up to ~85%
- Large windows (500K+): same proportional thresholds apply

---

## Auto-Compaction

ARC recommends disabling auto-compaction where platforms support it. This makes the user's
monitoring role explicit: the platform warns when context is filling, and the user responds
by triggering handoff.

**When you can't disable it:** Compensate with more frequent commits (reducing uncommitted work
at risk) and earlier handoffs (capturing state before compaction does). Understand your
platform's compaction behavior — when it triggers, what it preserves, how it signals — so you
can factor it into your workflow.

---

## Session State Portability

ARC's session state files — SESSION-NOTES.md and other personal workspace content in
`user/{identity}/` — are gitignored by design. This keeps personal context out of git history
but creates a portability challenge: session context doesn't travel with the branch when you
switch machines or hand off to a teammate.

### The git notes mechanism

ARC uses [git notes][git-notes] to serialize and transport personal workspace content without
polluting git history. A single notes ref — `refs/notes/arc/user/{identity}` — stores the user
directory contents as a note attached to HEAD at handoff time.

**How it works:**

- **Save** (`arc user save`): Serialize `user/{identity}/` contents to a git note on HEAD
- **Load** (`arc user load`): Restore user directory from git note (on HEAD, walking ancestors
  if needed)
- **Push/pull** (`arc user push` / `arc user pull`): Transport notes refs to/from remote

Session workflows integrate these automatically: session handoff triggers save + push; session
init triggers pull + load when local files are missing or stale.

**Push policy** (`user.sync_push` in `arc-config.yml`):

- `always` — solo default. Auto-push after save, no friction.
- `prompt` — team default. Conscious choice per handoff.
- `manual` — full control. Push only when explicitly requested.

Per-developer override via `git config arc.sync_push`.

### Scope

Any file in the `user/{identity}/` directory — session notes, inbox items (arc-in-git),
personal scratch notes — travels through one mechanism. New file types added to the user
directory are automatically included without additional plumbing.

---

[session-loop]: ../../../system/workflows/arc/session-lifecycle/session-loop.md
[session-init]: ../../../system/workflows/arc/session-lifecycle/session-init.md
[session-handoff]: ../../../system/workflows/arc/session-lifecycle/session-handoff.md
[strategy-index]: ../STRATEGY-INDEX.md
[git-notes]: https://git-scm.com/docs/git-notes
