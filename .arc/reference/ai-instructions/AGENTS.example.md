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

*This reference card is part of the ARC (Agentic, Recursive, Coordination) development framework. It provides
quick orientation for AI assistants working on this project.*
