# {{PROJECT_NAME}} - AI Agent Reference Card

<!--
ARC Framework Template: Copy this file as AGENTS.md and customize for your project
- Replace all {{PLACEHOLDERS}} with your actual project values
- This is a reference card, not a workflow guide
- Keep it lean - don't duplicate what's in CURRENT-SESSION/DEVELOPMENT-RULES/QUICK-REFERENCE
- Focus on: orientation, lookups, gotchas, and maintenance
-->

**Version:** {{VERSION_DATE}} | **Maintained by:** {{MAINTAINER}} | **Source of truth:** `.arc/reference/`

## Project Overview

<!--
Brief 3-5 line description:
- What does this application do?
- Who is it for?
- Project type (solo showcase, team product, client work, etc.)
- Primary goal (showcase skills, solve business problem, etc.)
-->

{{PROJECT_NAME}} is {{PROJECT_DESCRIPTION}}.

**Project Type**: {{PROJECT_TYPE}}
**Primary Goal**: {{PRIMARY_GOAL}}

## Project Snapshot

<!--
Customize with your actual stack and repo structure.
Keep this lean - details belong in TECHNICAL-ARCHITECTURE.md
-->

**Technology Stack:**

- **Backend**: {{BACKEND_TECH}}
- **Frontend**: {{FRONTEND_TECH}}
- **Database**: {{DATABASE_TECH}}
- **Infrastructure**: {{INFRASTRUCTURE_TECH}}
- **External Services**: {{EXTERNAL_SERVICES}}

**Repository Layout:**

- `{{BACKEND_DIR}}/` - {{BACKEND_STRUCTURE}}
- `{{FRONTEND_DIR}}/` - {{FRONTEND_STRUCTURE}}
- `{{SHARED_DIR}}/` - {{SHARED_STRUCTURE}}
- `.arc/` - Documentation (constitution, strategies, workflows, active/upcoming tasks)
- `{{INFRASTRUCTURE_DIR}}/` - {{INFRASTRUCTURE_STRUCTURE}}
- `{{VENV_PATH}}/` - {{VENV_DESCRIPTION}}

## Critical Path Information

<!--
Document your project's most common friction points:
- Paths that are frequently wrong
- Tools that need special invocation
- Working directory gotchas
- Environment setup requirements
- Common mistakes to avoid
-->

**Common Friction Points:**

- **{{INFRASTRUCTURE_LOCATION}}**: `{{INFRASTRUCTURE_PATH}}` (from repo root)
- **{{VENV_NAME}}**: `{{VENV_PATH}}/` (from repo root)
- **{{TESTS_REQUIREMENT}}**: {{TESTS_CONTEXT}}
- **Working directory varies**: Check CURRENT-SESSION.md Session Startup Protocol for current context
  ({{WORKING_DIR_OPTIONS}})
- **Commands in QUICK-REFERENCE**: All assume repo root - adjust paths based on current working directory
- **{{ADDITIONAL_GOTCHA_1}}**: {{GOTCHA_DESCRIPTION_1}}
- **{{ADDITIONAL_GOTCHA_2}}**: {{GOTCHA_DESCRIPTION_2}}

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

**Project Information:**

- **Run tests/linting** → `DEVELOPMENT-RULES.md` + `QUICK-REFERENCE.md` (commands section)
- **Understand the product** → `META-PRD.md`
- **See current progress** → `PROJECT-STATUS.md`
- **Learn the architecture** → `TECHNICAL-ARCHITECTURE.md`
- **Get environment context** → `QUICK-REFERENCE.md`

### "What are the rules for...?"

- **Development standards** → `DEVELOPMENT-RULES.md`
- **AI collaboration protocols** → `DEVELOPMENT-RULES.md` (AI Session sections)
- **Code quality requirements** → `TECHNICAL-ARCHITECTURE.md` + `DEVELOPMENT-RULES.md`
- **Commit format and process** → `workflows/supplemental/atomic-commit.md`
- **Task management** → `workflows/3-process-task-loop.md`

### "Where is...?"

- **Active work** → `.arc/active/` (current feature work, CURRENT-SESSION.md)
- **Upcoming work** → `.arc/upcoming/` (planned features, PRDs)
- **Completed work** → `.arc/archive/` (historical context)
- **Project rules** → `.arc/reference/constitution/` (META-PRD, DEVELOPMENT-RULES, etc.)
- **Workflows** → `.arc/reference/workflows/` (core + supplemental)
- **Patterns** → `.arc/reference/strategies/` (architectural decisions)

## Document Dependencies

When constitutional documents change, update related files to keep documentation in sync:

**META-PRD.md changes** → Update:

- `ai-instructions/AGENTS.md` (this file) - project overview and features
- Potentially `PROJECT-STATUS.md` - if scope or priorities change

**DEVELOPMENT-RULES.md changes** → Update:

- Version number in DEVELOPMENT-RULES.md
- All `ai-instructions/*.md` files - if protocols change
- Team communication about rule changes (if applicable)

**TECHNICAL-ARCHITECTURE.md changes** → Update:

- `ai-instructions/AGENTS.md` (this file) - technology stack and patterns
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
- Agent-specific instruction files (CLAUDE.md, etc.) should reference this file rather than duplicating content
- Commands and detailed workflows live in other docs - this is just a reference card
- Keep this file lean - if something is covered in CURRENT-SESSION/DEVELOPMENT-RULES/QUICK-REFERENCE, don't
  repeat it here
- Tool-specific files should be minimal: reference AGENTS.md + add tool-specific tips only

---

*This reference card is part of the ARC (Agentic, Recursive, Coordination) development framework. It provides
quick orientation and lookup guidance for AI assistants working on this project.*
