# Customization

ARC ships strong defaults for every convention. Customization is how you adapt those conventions
to your team's workflow while keeping the [methodology](../methodology/index.md) intact.

The principles stay fixed; the implementation details flex. See
[Principles vs. Conventions](../methodology/rationale.md#principles-vs-conventions) for where
the line falls.

## Project-Level Files

Most customization in ARC happens through the simplest pattern: editing files that ARC ships
with framework defaults and project-specific sections designed for your team to fill in.

These files are classified as **Configurable** — `arc update` preserves your changes through
three-way merge. They are the primary surface where your project's identity takes shape.

### Files loaded every session

The agent reads these during initialization and treats them as authoritative project context:

- **DEV-RULES.PROJECT** (`system/rules/`): your project's quality standards, testing
  requirements, architecture rules, and code quality expectations.
- **QUICK-REFERENCE** (`reference/`): commands, environment context, path references, and
  tooling. The agent's operational cheat sheet for your project.
- **AGENT-BRIEFING.PROJECT** (`system/agent/`): project overview, tech stack, and friction
  points. Shapes how the agent understands your project.
- **Agent-specific files** (`system/agent/`): per-agent operational guidance like
  `CLAUDE.ARC.md` or `GEMINI.ARC.md` — platform-specific notes, sub-agent availability,
  MCP configuration.
- **STRATEGY-INDEX** (`reference/strategies/`): the ARC strategies section ships with the
  framework; the project strategies section is yours to populate as domain patterns emerge.

### Files you create

Beyond editing existing files, you can create new project-owned files that extend ARC's
guidance for your specific domain:

- **Project strategies** (`reference/strategies/project/`): domain-specific guidance —
  authentication patterns, testing methodology, component styling. Consulted on-demand when
  work touches the domain.
- **Project workflows** (`system/workflows/project/`): project-specific procedures not covered
  by ARC — deploy checklists, release workflows, environment setup.
- **Domain-specific rules** (`system/rules/`): extend `DEV-RULES.PROJECT.md` with
  domain files like `DEV-RULES.FRONTEND.md` or `DEV-RULES.AUTH.md`. Loaded on-demand when
  work touches the relevant domain.

## Mechanisms

For customization that goes beyond editing project files:

- **[Configuration](configuration.md)** — `arc-config.yml` settings that control enforcement
  levels, mode selections, and behavioral toggles.
- **[Methods & Extensions](methods.md)** — replace *how* ARC does something (method overrides)
  or inject additional steps at workflow boundaries (extension points).
- **[Agent Hooks](hooks.md)** — platform-level lifecycle hooks that complement ARC's
  document-based workflows with deterministic automation. Optional for platforms that support
  them.
