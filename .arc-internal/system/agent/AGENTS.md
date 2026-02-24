# ARC Framework — AI Agent Reference Card

**Version:** 2026-02-24 | **Maintained by:** Andrew | **Source of truth:** `.arc-internal/`

## Project Overview

The ARC Framework is a development methodology for human-AI collaboration. It structures how a
developer and an AI agent work together through implementation — planning, executing, verifying,
and preserving context across work sessions. The methodology is expressed as documentation:
workflows, templates, strategies, and constitutional documents that live in `.arc/`.

**Project Type**: Solo framework development with public release goals
**Primary Goal**: Deliver a coherent, configurable methodology — 11 non-negotiable principles
with strong default conventions that teams adapt to their context

## Project Snapshot

**Technology Stack:**

- **Framework Type**: Pure documentation system (no runtime, no containers)
- **Dependencies**: Git, Node.js (NPX for markdown linting)
- **Quality Gates**: Automated markdown linting (zero-tolerance policy), GitHub Actions CI
- **Distribution**: GitHub repository with template-first documents
- **Development Environment**: Cross-platform (Windows/WSL/Linux/Mac)

**Repository Layout:**

- `.arc/` - Deployable template system (reference/, active/, backlog/)
- `.arc-internal/` - Framework development workspace (constitution, workflows, active work)
- Root-level documentation (README.md, ADOPTION.md, etc.)

## Critical Path Information

**Common Friction Points:**

- **No runtime**: This is documentation-only - no Docker, no services, no backend/frontend to run
- **Markdown linting is THE quality gate**: `npx --yes markdownlint-cli *.md .arc/**/*.md .arc-internal/**/*.md`
- **Working directory**: Always at repository root (`/home/andrew/dev/arc-agentic-dev-framework/`)
- **Commands in QUICK-REFERENCE**: All assume repo root - paths are already correct
- **Template vs. Internal**: `.arc/` = templates for users (`reference/` + `system/`), `.arc-internal/` = framework-specific
- **Self-hosting**: Framework development follows its own ARC methodology
- **Zero tolerance**: All markdown linting violations must be fixed before commits

## Agent Working Guidelines

**Working Approach:**

- **Plan before executing** - Default to plan-driven execution; skip plans only for trivial tasks
- **Respect user intent** - Never revert or "fix" user changes without explicit approval
- **Stop on anomalies** - Treat unexpected filesystem diffs as a stop signal and request guidance.
  Note: the developer may be working alongside you — editing files, running commands, making
  commits. Co-development diffs are normal, not anomalies. Flag only changes that conflict
  with your current task or seem unintentional.
- **Limit scope** - Avoid global mutations or widespread changes without explicit approval
- **One task at a time** - Complete one checkbox item, report, and await approval before proceeding
- **Manual commit control** - AI NEVER initiates commits without explicit user approval or instruction

**Communication:**

- **Focus on value** - Prioritize findings, risks, and actionable next steps in summaries
- **Be clear and targeted** - Provide enough detail to be useful, not so much it's overwhelming

---

*This reference card is the shared entry point for all AI agents working on the ARC
Framework. Agent-specific guidance lives in dedicated files (CLAUDE.md, GEMINI.md, etc.).*
