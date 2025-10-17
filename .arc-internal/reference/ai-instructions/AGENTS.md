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

## Quick Lookup Guide

When you need to find information, use these pointers (don't load everything upfront):

### "How do I...?"

**ARC Framework Processes:**

- **Set up project foundation** → `workflows/0-define-constitution.md`
- **Start a new feature** → `workflows/1-create-prd.md`
- **Break down tasks** → `workflows/2-generate-tasks.md`
- **Implement tasks** → `workflows/3-process-task-loop.md`
- **Handle maintenance work** → `workflows/supplemental/manage-incidental-work.md`
- **Hand off session** → `workflows/supplemental/session-handoff.md`
- **Clean up completed work** → `workflows/supplemental/archive-completed.md`
- **Sync from CineXplorer** → `workflows/supplemental/sync-cinexplorer-refinements.md`
- **Maintain task lists** → `workflows/supplemental/maintain-task-notes.md`

**Framework Information:**

- **Run linting** → `DEVELOPMENT-RULES.md` + `QUICK-REFERENCE.md` (markdown linting commands)
- **Understand the framework** → `META-PRD.md`
- **See current progress** → `PROJECT-STATUS.md`
- **Learn the architecture** → `TECHNICAL-ARCHITECTURE.md`
- **Get environment context** → `QUICK-REFERENCE.md`

### "What are the rules for...?"

- **Development standards** → `DEVELOPMENT-RULES.md`
- **AI collaboration protocols** → `DEVELOPMENT-RULES.md` (AI Session sections)
- **Documentation quality** → `TECHNICAL-ARCHITECTURE.md` + `DEVELOPMENT-RULES.md`
- **Commit format and process** → `workflows/supplemental/atomic-commit.md`
- **Task management** → `workflows/3-process-task-loop.md`

### "Where is...?"

- **Active work** → `.arc-internal/active/` (current feature work, CURRENT-SESSION.md)
- **Upcoming work** → `.arc-internal/upcoming/` (planned features)
- **Completed work** → `.arc-internal/archive/` (historical context)
- **Framework rules** → `.arc-internal/reference/constitution/` (META-PRD, DEVELOPMENT-RULES, etc.)
- **Workflows** → `.arc-internal/reference/workflows/` (core + supplemental)
- **Template examples** → `.arc/reference/` (deployable templates for users)
- **Framework-specific docs** → `.arc-internal/reference/` (internal documentation)

## Document Dependencies

When constitutional documents change, update related files to keep documentation in sync:

**META-PRD.md changes** → Update:

- `ai-instructions/AGENTS.md` (this file) - framework overview and features
- Potentially `PROJECT-STATUS.md` - if scope or priorities change

**DEVELOPMENT-RULES.md changes** → Update:

- All `ai-instructions/*.md` files - if protocols change
- Framework templates - if rule changes affect template defaults

**TECHNICAL-ARCHITECTURE.md changes** → Update:

- `ai-instructions/AGENTS.md` (this file) - architecture patterns
- Consider `PROJECT-STATUS.md` if architectural decisions affect roadmap

**PROJECT-STATUS.md changes** → Update:

- Consider if major status changes affect ongoing work priorities

## AI Collaboration Principles

**Working Approach:**

- **Plan before executing** - Default to plan-driven execution; skip plans only for trivial tasks
- **Respect user intent** - Never revert or "fix" user changes without explicit approval
- **Stop on anomalies** - Treat unexpected filesystem diffs as a stop signal and request guidance
- **Limit scope** - Avoid global mutations or widespread changes without explicit approval

**Communication:**

- **Focus on value** - Prioritize findings, risks, and actionable next steps in summaries
- **Be clear and targeted** - Provide enough detail to be useful, not so much it's overwhelming

## Maintenance Notes

- When `DEVELOPMENT-RULES.md` or `TECHNICAL-ARCHITECTURE.md` change, skim this file and update only if the
  high-level snapshot is now inaccurate
- Agent-specific instruction files (CLAUDE.md, WARP.md, GEMINI.md) should reference this file rather than
  duplicating content
- Commands and detailed workflows live in other docs - this is just a reference card
- Keep this file lean - if something is covered in CURRENT-SESSION/DEVELOPMENT-RULES/QUICK-REFERENCE, don't
  repeat it here
- Framework develops itself using ARC methodology - we are our own test case

---

*This reference card is part of the ARC (Agentic, Recursive, Coordination) development framework internal
documentation. It provides quick orientation and lookup guidance for AI assistants working on framework development.*
