# Strategy: Agent Hooks

**Purpose:** Guidance for teams considering agent lifecycle hooks as an optional automation and enforcement layer
alongside ARC's existing triggering model.

**Scope:** What agent hooks are, how they relate to ARC's customization model, which ARC behaviors map to hook
events, and where hooks add genuine value versus redundancy. This document is platform-aware but not
platform-specific — it describes concepts and mappings, not configuration syntax.

---

## Contents

- [What Agent Hooks Are](#what-agent-hooks-are) — platform-level lifecycle events
- [Relationship to ARC's Customization Model](#relationship-to-arcs-customization-model) — different layer, complementary
- [ARC Behavior Mapping](#arc-behavior-mapping) — which behaviors map to which events
- [Value Assessment](#value-assessment) — where hooks add genuine capability
- [Adopter Guidance](#adopter-guidance) — when and how to use hooks with ARC

---

## What Agent Hooks Are

Agent hooks are lifecycle event handlers supported by most modern AI coding agent platforms. When a platform event
fires (session start, tool use, context compaction, etc.), registered hook handlers execute — typically shell
commands that run before or after the event.

### Common Core

No formal open standard governs agent hooks (no W3C, IETF, or ECMA specification). However, a de facto common
core has emerged across major platforms through adoption convergence:

- **JSON configuration** — the dominant format across platforms
- **Pre/Post event pairs** — symmetrical events (e.g., pre-tool-use / post-tool-use)
- **Exit code semantics** — 0 (success), 2 (block the action) for pre-event hooks
- **stdin/stdout communication** — standard I/O for hook handler data exchange
- **Project-scoped and user-scoped** configuration layers

### Platform Landscape

As of early 2026, agent hook support is near-universal among major coding agent platforms including Claude Code,
GitHub Copilot, Cursor, Windsurf, Gemini CLI, OpenAI Codex CLI, and VS Code. Event naming and configuration
structure vary across platforms but follow the common patterns above. Platforms differ in the number of supported
events (from 4 to 20+) and handler types (shell commands are universal; some platforms also support HTTP,
prompt injection, and sub-agent handlers).

This landscape is evolving. Consult your platform's documentation for current hook capabilities and
configuration syntax.

---

## Relationship to ARC's Customization Model

ARC already has a layered triggering model that produces largely mechanical, self-propelling behavior
(see [Configurability Architecture Strategy][config-arch] for the full customization model):

1. **User-invoked commands** — The user triggers key workflows directly (e.g., invoking session initialization,
   commit preparation, or session handoff via platform-specific commands or skills). These are deterministic and
   user-initiated.
2. **Workflow-to-workflow references** — Once triggered, workflows reference other workflows, methods, and
   extensions mechanically. The agent follows the chain because each step points to the next.
3. **Instruction-based guidance** — The agent reads loaded documents and follows conventions described in them.
   This is the least deterministic layer — it depends on agent compliance.

Agent hooks add a fourth layer beneath all of these:

| Layer       | Mechanism            | Triggered By           | Example                             |
|-------------|----------------------|------------------------|-------------------------------------|
| Platform    | Agent hooks          | Platform events        | Shell script runs on SessionStart   |
| Platform    | Git hooks            | Git operations         | commit-msg validates format         |
| User        | Invoked commands     | User action            | `/arc-resume` triggers init         |
| Methodology | Workflow references  | Prior workflow step    | Task loop → integrate-work-unit     |
| Methodology | Extensions + methods | Workflow execution     | post-context-load loads team docs   |
| Methodology | Loaded guidance      | Agent reads docs       | Conventions from DEV-RULES          |

**Where hooks fit:** Agent hooks are platform-deterministic — they fire regardless of what the agent or user
decides to do. This makes them most valuable where no other trigger exists. Much of ARC's common workflow is
already triggered by user commands (layer 1) and self-propelling workflow chains (layer 2). Hooks add the most
value at lifecycle boundaries that currently lack a deterministic trigger — particularly context compaction,
where no user action or workflow reference can intervene.

**Complementary, not competing.** A SessionStart hook and the `post-context-load` extension point serve
different purposes at different layers:

- The **SessionStart hook** can prompt the agent to run the session-init workflow — platform-level automation
  that triggers the workflow without user action
- The **post-context-load extension** customizes behavior *within* that workflow — methodology-level
  customization of what gets loaded

Neither replaces the other. The hook ensures the workflow runs; the extension customizes what happens inside it.

Agent hooks are analogous to ARC's existing git hooks — platform-level mechanisms that enforce conventions
deterministically. ARC already uses git hooks for commit format validation (`commit-msg`) and pre-commit quality
checks (`pre-commit`). Agent hooks extend this pattern to the agent lifecycle.

---

## ARC Behavior Mapping

ARC behaviors that correspond to common agent hook events, grouped by value tier.

### High Value — Genuine Capability Gain

These mappings address gaps where no existing trigger mechanism covers the behavior.

**Context compaction → session handoff (safety net)**

- **Hook event:** PreCompact (or platform equivalent)
- **ARC behavior:** Session handoff workflow (`session-handoff.md`)
- **Why it matters:** ARC's session model expects the user to monitor context usage via their platform's
  reporting (persistent indicators, on-demand commands, threshold warnings — mechanisms vary by platform) and
  invoke session handoff before context is exhausted. The agent also self-monitors as a secondary check. A
  PreCompact hook provides a last-resort safety net: if neither the user nor the agent acted in time and the
  platform is about to compact context, the hook triggers a handoff prompt. This is a fallback, not the primary
  mechanism — the primary mechanism is user awareness and proactive handoff invocation.
- **Limitation:** PreCompact is not universally available (confirmed on Claude Code and Cursor; absent on
  several platforms). Where unavailable, user monitoring and agent self-monitoring remain the only mechanisms.
  ARC recommends disabling auto-compaction where platforms allow it, which makes proactive handoff even more
  important.

**Session start → session initialization (reinforcement)**

- **Hook event:** SessionStart (or platform equivalent)
- **ARC behavior:** Session initialization workflow (`session-init.md`)
- **Why it matters:** Session initialization is normally user-invoked — the user triggers it via a platform
  command or skill at session start. A SessionStart hook automates this trigger, removing the dependency on the
  user remembering to invoke it. This is reinforcement of an already-reliable pattern, not a fix for a broken
  one.
- **Limitation:** The hook can prompt the agent, but the agent still performs the actual workflow (reading
  documents, checking state). The hook automates the trigger, not the workflow itself.

### Moderate Value — Reinforcement of Existing Enforcement

These mappings duplicate enforcement that already exists through other mechanisms.

**Pre-commit tool use → quality gate check**

ARC already enforces quality gates through git hooks (`pre-commit`). An agent-level PreToolUse hook on commit
operations would add a second enforcement layer — catching issues before they reach the git hook. This is
defense-in-depth but adds complexity for marginal gain when git hooks are functioning correctly.

**User prompt → context enrichment**

ARC's session initialization already loads all necessary context at session start. A UserPromptSubmit hook
for per-prompt context injection is more relevant to teams without a structured initialization ceremony than
to ARC adopters who already have one.

### Low Value — Outside ARC's Concerns

Post-tool-use logging, file protection, MCP governance, notification hooks — these solve problems that either
don't apply to ARC's methodology scope or are handled through other mechanisms.

---

## Value Assessment

The value of agent hooks for ARC adopters depends on what problem they solve:

**ARC is already largely mechanical.** User-invoked commands trigger workflows; workflows chain to other
workflows via methods, extensions, and direct references; git hooks enforce commit conventions. The system is
intentionally self-propelling once triggered. Hooks add platform-level automation at the boundaries of this
model — places where a trigger currently depends on user action or agent judgment rather than mechanical
chaining.

**Hooks fill specific gaps, not a general one.** The primary gap is context compaction — the one lifecycle
event where no user command or workflow reference can intervene. Session initialization is already user-invoked
and reliable; a SessionStart hook is convenience automation, not a reliability fix. The value is narrow but
real where it exists.

**Hooks do not solve the methodology gap.** ARC's value is in the methodology itself — structured planning,
co-development, context preservation, quality gates. Hooks can automate the triggers for these behaviors but
cannot substitute for them. A SessionStart hook that prompts "run session-init" is only valuable because
session-init is a well-designed workflow. The hook is infrastructure; the methodology is the product.

**ARC must work fully without hooks.** Hooks are platform-specific and vary in capability. ARC's triggering
model — user-invoked commands, workflow chaining, git hooks, and instruction-based guidance — is the universal
baseline. Agent hooks are optional reinforcement for platforms that support them, never a requirement.

---

## Adopter Guidance

### When to consider hooks

- Your platform supports hooks with the events you need
- You've experienced a specific gap hooks would address (e.g., context compaction without handoff)
- You want to automate a trigger that currently requires user action (e.g., session initialization)

### When hooks are unnecessary

- ARC's existing triggering model (user commands, workflow chaining, git hooks) covers your workflow reliably
- Your platform has limited hook support (few events, no blocking capability)
- You're early in ARC adoption — learn the methodology before automating it

### Implementation approach

1. **Use ARC's existing triggers first** — user-invoked commands and workflow chaining cover most use cases
2. **Identify specific gaps** — where does a trigger depend on user memory or agent judgment?
3. **Add hooks for those gaps** — targeted automation, not blanket coverage
4. **Consult platform documentation** — event names, configuration format, and handler capabilities are
   platform-specific

### Relationship to ARC configuration

Agent hooks are configured in your platform's settings (not in `arc-config.yml`). They are platform
infrastructure, not ARC configuration. ARC does not ship hook configurations or manage hook lifecycle — the
team configures hooks in their platform's native format and ARC's methodology documents describe what behaviors
to trigger.

If hooks are used to enforce ARC conventions that also have config-level enforcement (e.g., commit format
validation), the two layers are independent. Disabling a git hook via `hooks.commit_msg: disabled` does not
affect an agent hook that validates commit format, and vice versa.

---

[config-arch]: strategy-configurability-architecture.md
