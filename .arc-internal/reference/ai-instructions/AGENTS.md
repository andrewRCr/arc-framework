# ARC Agentic Development Framework - AI Agent Reference Card

**Version:** 2025-10-17 | **Maintained by:** Andrew | **Source of truth:** `.arc-internal/reference/`

## Project Overview

The ARC Agentic Development Framework is a structured documentation framework designed to facilitate collaboration
between human developers and AI agents. By emphasizing spec-driven development and clear task breakdowns, it creates
a shared understanding and efficient workflows for software development projects.

**Project Type**: Solo framework development with public release goals
**Primary Goal**: Create a comprehensive, battle-tested methodology for AI-human development collaboration

## Project Snapshot

**Technology Stack:**

- **Framework Type**: Pure documentation system (no runtime, no containers)
- **Dependencies**: Git, Node.js (NPX for markdown linting)
- **Quality Gates**: Automated markdown linting (zero-tolerance policy), GitHub Actions CI
- **Distribution**: GitHub repository with template-first documents
- **Development Environment**: Cross-platform (Windows/WSL/Linux/Mac)

**Repository Layout:**

- `.arc/` - Deployable template system (reference/, active/, upcoming/, archive/)
- `.arc-internal/` - Framework development workspace (constitution, workflows, active work)
- `templates/` - Legacy directory (being consolidated into .arc/)
- Root-level documentation (README.md, ADOPTION.md, CHANGELOG.md, etc.)

## Critical Path Information

**Common Friction Points:**

- **No runtime**: This is documentation-only - no Docker, no services, no backend/frontend to run
- **Markdown linting is THE quality gate**: `npx --yes markdownlint-cli *.md .arc/**/*.md .arc-internal/**/*.md`
- **Working directory**: Always at repository root (`/home/andrew/dev/arc-agentic-dev-framework/`)
- **Commands in QUICK-REFERENCE**: All assume repo root - paths are already correct
- **Template vs. Internal**: `.arc/reference/` = templates for users, `.arc-internal/reference/` = framework-specific
- **Self-hosting**: Framework development follows its own ARC methodology
- **Zero tolerance**: All markdown linting violations must be fixed before commits

## AI Collaboration Principles

**Working Approach:**

- **Plan before executing** - Default to plan-driven execution; skip plans only for trivial tasks
- **Respect user intent** - Never revert or "fix" user changes without explicit approval
- **Stop on anomalies** - Treat unexpected filesystem diffs as a stop signal and request guidance
- **Limit scope** - Avoid global mutations or widespread changes without explicit approval
- **One subtask at a time** - Complete tasks incrementally, await approval between subtasks
- **Manual commit control** - AI NEVER initiates commits without explicit user approval or instruction

**Communication:**

- **Focus on value** - Prioritize findings, risks, and actionable next steps in summaries
- **Be clear and targeted** - Provide enough detail to be useful, not so much it's overwhelming

---

*This reference card is part of the ARC development framework internal documentation.
It provides quick orientation for AI assistants working on framework development.*
