# Agent Hooks

Agent hooks are lifecycle event handlers supported by most modern AI coding agent platforms.
When a platform event fires (session start, tool use, context compaction), registered hook
handlers execute — typically shell commands that run before or after the event.

Hooks complement ARC's document-based workflows with deterministic automation. They are
optional — ARC works fully without them — but fill specific gaps where no other trigger
mechanism exists.

## How Hooks Relate to ARC

ARC already has a layered triggering model that produces largely mechanical, self-propelling
behavior:

| Layer       | Mechanism            | Triggered by        | Example                           |
|-------------|----------------------|---------------------|-----------------------------------|
| Platform    | Agent hooks          | Platform events     | Shell script runs on SessionStart |
| Platform    | Git hooks            | Git operations      | commit-msg validates format       |
| User        | Invoked commands     | User action         | `/arc-resume` triggers init       |
| Methodology | Workflow references  | Prior workflow step | Task loop → integrate-work-unit   |
| Methodology | Extensions + methods | Workflow execution  | post-context-load loads team docs |
| Methodology | Loaded guidance      | Agent reads docs    | Conventions from DEV-RULES        |

Agent hooks sit at the platform layer — they fire regardless of what the agent or user decides
to do. This makes them most valuable where no other trigger exists.

!!! tip "Complementary, not competing"

    A SessionStart hook and the `post-context-load` extension point serve different purposes
    at different layers. The **hook** ensures the workflow runs (platform-level automation).
    The **extension** customizes what happens inside the workflow (methodology-level
    customization). Neither replaces the other.

## Where Hooks Add Value

### High value — genuine capability gain

**Context compaction → session handoff (safety net)**

ARC's session model expects the user to monitor context usage and invoke session handoff before
context is exhausted. The agent also self-monitors as a secondary check. A PreCompact hook
provides a last-resort safety net: if neither acted in time and the platform is about to compact
context, the hook triggers a handoff prompt.

This is a fallback, not the primary mechanism. The primary mechanism is user awareness and
proactive handoff invocation.

**Session start → session initialization (reinforcement)**

Session initialization is normally user-invoked. A SessionStart hook automates this trigger,
removing the dependency on the user remembering to invoke it. This is reinforcement of an
already-reliable pattern, not a fix for a broken one.

### Moderate value — reinforcement of existing enforcement

**Pre-commit tool use → quality gate check.** ARC already enforces quality gates through git
hooks (`pre-commit`). An agent-level PreToolUse hook on commit operations adds a second
enforcement layer — defense-in-depth but marginal gain when git hooks function correctly.

**User prompt → context enrichment.** ARC's session initialization already loads all necessary
context at session start. Per-prompt context injection is more relevant to teams without a
structured initialization ceremony.

??? info "Low value hooks"

    Post-tool-use logging, file protection, MCP governance, and notification hooks solve
    problems that either don't apply to ARC's methodology scope or are handled through other
    mechanisms. They are not harmful to configure but provide no ARC-specific benefit.

??? info "The platform landscape"

    No formal open standard governs agent hooks (no W3C, IETF, or ECMA specification).
    However, a de facto common core has emerged across major platforms:

    - **JSON configuration** — the dominant format
    - **Pre/Post event pairs** — symmetrical events (e.g., pre-tool-use / post-tool-use)
    - **Exit code semantics** — 0 (success), 2 (block the action) for pre-event hooks
    - **stdin/stdout communication** — standard I/O for data exchange
    - **Project-scoped and user-scoped** configuration layers

    As of early 2026, agent hook support is near-universal among major coding agent platforms
    including Claude Code, GitHub Copilot, Cursor, Windsurf, Gemini CLI, OpenAI Codex CLI,
    and VS Code. Event naming and configuration structure vary but follow the common patterns
    above. Platforms differ in supported events (4 to 20+) and handler types (shell commands
    are universal; some also support HTTP, prompt injection, and sub-agent handlers).

    This landscape is evolving. Consult your platform's documentation for current capabilities.

## When to Consider Hooks

**Good reasons to add hooks:**

- Your platform supports hooks with the events you need
- You've experienced a specific gap hooks would address (e.g., context compaction without
  handoff)
- You want to automate a trigger that currently requires user action (e.g., session
  initialization)

**When hooks are unnecessary:**

- ARC's existing triggering model covers your workflow reliably
- Your platform has limited hook support (few events, no blocking capability)
- You're early in ARC adoption — learn the methodology before automating it

## Implementation Approach

1. **Use ARC's existing triggers first** — user-invoked commands and workflow chaining cover
   most use cases
2. **Identify specific gaps** — where does a trigger depend on user memory or agent judgment?
3. **Add hooks for those gaps** — targeted automation, not blanket coverage
4. **Consult platform documentation** — event names, configuration format, and handler
   capabilities are platform-specific

### Relationship to ARC configuration

Agent hooks are configured in your platform's settings, not in `arc-config.yml`. They are
platform infrastructure, not ARC configuration. ARC does not ship hook configurations or manage
hook lifecycle.

If hooks enforce ARC conventions that also have config-level enforcement (e.g., commit format
validation), the two layers are independent. Disabling a git hook via `hooks.commit_msg: disabled`
does not affect an agent hook that validates commit format, and vice versa.

??? info "Why ARC doesn't ship hook configurations"

    ARC must work fully without hooks. Hooks are platform-specific and vary in capability.
    ARC's triggering model — user-invoked commands, workflow chaining, git hooks, and
    instruction-based guidance — is the universal baseline. Agent hooks are optional
    reinforcement for platforms that support them, never a requirement.

    The methodology describes *what behaviors* to trigger. Teams configure their platform
    accordingly.
