# Strategy: Context Loading

**Purpose:** Define how context is delivered to agents during ARC sessions — the tiered model that controls what an
agent knows at each point, and the loading mechanisms that deliver it.

**Scope:** Context delivery within a session. For context preservation across sessions, see
[Session Management Strategy][session-mgmt]. For session lifecycle procedures (init, handoff), see the
[session lifecycle workflows][session-init].

---

## Contents

- [The Three-Tier Model](#the-three-tier-model) — constitutional, state, procedural
- [Classification Criteria](#classification-criteria) — which tier for new content
- [Loading Mechanisms](#loading-mechanisms) — how each tier enters agent context
- [Instruction Density](#instruction-density) — not all context costs the same
- [Method and Extension Loading](#method-and-extension-loading) — on-demand procedural content
- [Adopter Scaling](#adopter-scaling) — keeping customizations manageable

---

## The Three-Tier Model

ARC organizes agent context into three tiers based on when the content becomes relevant:

| Tier | Name           | When Loaded                          | Content Type                                              |
|------|----------------|--------------------------------------|-----------------------------------------------------------|
| T1   | Constitutional | Session initialization               | Principles, identity, constraints, navigation             |
| T2   | State          | Session initialization               | Work status, session notes, task overview                 |
| T3   | Procedural     | On-demand at workflow trigger points | Method defaults/overrides, strategies, detailed workflows |

**T1 — Constitutional.** Content that governs all agent behavior regardless of the session's work. Violating these
without knowledge would cause incorrect behavior across any activity. Always loaded at session start, always in
context.

- ARC-AGENTS.md (identity and collaboration principles)
- Agent-specific file (operational guidance)
- DEV-RULES — ARC and Project (quality standards, methodology rules)
- STRATEGY-INDEX — both framework and project (navigation to domain guidance)
- QUICK-REFERENCE (environment context, command patterns)
- arc-config.yml (project settings)

**T2 — State.** Content that orients the agent — where work stands, what happened last session, what comes next.
Always loaded at session start. Without this, the agent cannot determine what to do.

- WORK-STATUS.md (branch, task list, next task, blockers)
- SESSION-NOTES.md (personal session context from prior handoff)
- Task list overview and current task section (strategic partial read)

**T3 — Procedural.** Step-by-step guidance for specific activities that may or may not happen in a given session.
Loaded on-demand when the agent enters the relevant workflow phase. Never loaded at session initialization.

- arc-methods defaults and overrides (decision trees, format specs, classification rubrics)
- Strategy documents (domain-specific patterns and guidance)
- Workflow documents (process-task-loop, prepare-commits, integrate-work-unit)
- arc-extensions steps (post-task-quality, pre-merge-review, etc.)

### Why Not Load Everything Upfront?

Loading all guidance at session start has two costs:

1. **Token budget.** Every line loaded at init competes for the agent's working context throughout the session.
   Procedural content that never triggers is wasted capacity.

2. **Attention dilution.** Research on context degradation (see [Session Management Strategy][session-mgmt] §
   Context Degradation) shows that agent performance degrades with context volume. The degradation is
   disproportionately costly for dense instructional content — procedural steps the agent must follow precisely
   are more attention-expensive than reference facts the agent may consult.

The tiered model addresses both: constitutional and state content earns its context cost because it governs
everything; procedural content loads precisely when actionable.

---

## Classification Criteria

When adding new content to ARC — strategy docs, method overrides, extensions, workflow guidance — classify it by
asking:

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

**When uncertain, prefer T1.** The cost of loading unnecessary constitutional content is wasted tokens; the cost
of missing it is incorrect behavior. Err toward front-loading.

---

## Loading Mechanisms

Each tier has established mechanisms for how content enters agent context:

### Session initialization (T1 + T2)

The [session-init workflow][session-init] prescribes upfront loading of constitutional and state documents in a
defined order. This is a bulk load — deterministic, ordered, and complete before work begins. The load order
(general → specific) ensures each document is understood in the context of what came before.

### Workflow-embedded directives (T3)

Workflow documents contain explicit loading instructions for the methods and references they depend on. When the
agent reaches a workflow step that references a method or strategy, the workflow tells it to load the relevant
section. This is the primary mechanism for procedural content.

Directives appear as a method dependencies block near the top of workflow documents:

> **Method dependencies (load on first reference):** [method-a], [method-b]. For each, check `.override`
> first; use `.default` if no override is configured.

This mechanism is deterministic (the workflow prescribes it), automatic (the agent follows the workflow step by
step), and scoped (only the relevant methods load, only when needed).

### Strategy-index triggers (T3)

DEV-RULES instructs agents to check the [Strategy Index][strategy-index] before working in codified domains. The
index serves as a T1 navigation layer (always loaded) that points to T3 strategy content (loaded on-demand). Each
entry includes "Consult when:" triggers so agents can determine relevance without loading the full document.

### User-invocable skills (T3)

Skills (arc-resume, arc-commit, arc-handoff) are user-initiated triggers that load thin guidance layers and
reference T3 workflows. These cover session lifecycle events where the user explicitly initiates the activity.

---

## Instruction Density

Not all context is equal in attention cost. The tiered model is informed by a distinction between content types:

**Reference material** — Facts, settings, navigation indexes, environment context. Low attention cost. The agent
notes these passively and consults them as needed. Safe to front-load because they don't compete for active
instruction-following capacity.

*Examples: arc-config.yml values, QUICK-REFERENCE command patterns, STRATEGY-INDEX entries.*

**Behavioral principles** — Constraints and values that govern how the agent approaches all work. Moderate
attention cost. Worth front-loading because they apply to every action and the cost of violation is high.

*Examples: DEV-RULES rules ("AI never initiates commits without approval"), ARC-AGENTS.md collaboration principles.*

**Procedural instructions** — Step-by-step imperatives, decision trees, classification rubrics. High attention
cost. These require active instruction-following — the agent must track where it is in a sequence, evaluate
conditions, and execute precisely. Loading these when they're not actionable wastes the most valuable type of
context capacity.

*Examples: arc-methods decision trees (test-first, leave-it-cleaner), commit format specifications, review-triage
classification rubrics.*

**The principle:** Instruction density — not line count — determines context cost. A 50-line decision tree consumes
more attention capacity than a 100-line reference table. Classify new content by its instruction density when
choosing its loading tier.

---

## Method and Extension Loading

### arc-methods.md

Session initialization scans arc-methods.md for override *presence* only — which methods have active overrides.
The agent does not read `.default` or `.override` content at init. It produces a brief index: "Methods with
overrides: [list]" or "all methods at defaults."

Method content — the active version (override if present, default otherwise) — loads on-demand when the agent
reaches a workflow step that references the method. Each workflow that depends on methods includes a method
dependencies block.

**Method classification by trigger:**

| Method                | Trigger Workflow    | Session Applicability                      |
|-----------------------|---------------------|--------------------------------------------|
| leave-it-cleaner      | process-task-loop   | Universal — every task execution session   |
| quality-gate-commands | process-task-loop   | Universal — every task execution session   |
| test-first            | process-task-loop   | Conditional — tasks with test-first marker |
| commit-format         | prepare-commits     | User-triggered commit events               |
| commit-context-format | prepare-commits     | User-triggered commit events               |
| pre-merge-review      | integrate-work-unit | Integration phase only                     |
| review-triage         | integrate-work-unit | Integration phase only                     |
| session-state         | session-handoff     | Session end only                           |

Universal methods (leave-it-cleaner, quality-gate-commands) load early in most sessions — when the agent enters
task execution — but not during planning-only, documentation, or evaluation sessions where no tasks execute.

### arc-extensions.md

Extensions are architecturally on-demand — workflows check their specific extension section at the fire point,
not at session init. The process-task-loop checks `post-task-quality` after task completion; the
integrate-work-unit workflow checks `pre-merge-review` before merging. No change to extension loading is needed.

For guidance on keeping extensions lean as they grow, see [Adopter Scaling](#adopter-scaling).

---

## Adopter Scaling

As projects mature, the combined weight of method overrides, populated extensions, and non-default configuration
can accumulate. The tiered model prevents this from overwhelming session initialization, but adopters should be
aware of density at each layer:

**arc-config.yml** — Key-value settings. Low instruction density. Always loaded at init. Even with extensive
customization, this remains compact reference material. No concern.

**Method overrides** — Dense procedural instructions replacing defaults. On-demand loading ensures override content
enters context only at the relevant workflow trigger, not at session start. An adopter with five method overrides
pays zero init-time context cost; each override loads only when its workflow fires.

**Extensions** — Steps that fire at workflow trigger points. Already on-demand by architecture. Keep extension
steps lean (~10-20 lines of instructions per extension). If an extension grows beyond this, extract the detail
into a standalone document and have the extension step reference it — an additional layer of on-demand loading:

```markdown
### post-task-quality.steps

Run the security scanning protocol:

1. Load and follow `reference/security-scan-protocol.md`
2. Report findings using the security-scan output format
```

**General guidance:** When adding customizations, assess instruction density. Reference material (config values,
fact tables) is low-cost at any tier. Dense procedural content (decision trees, multi-step protocols,
classification rubrics) should load on-demand via workflow triggers, not at session start.

---

[session-mgmt]: strategy-session-management.md
[session-init]: ../../../system/workflows/arc/session-lifecycle/session-init.md
[strategy-index]: ../STRATEGY-INDEX.md
