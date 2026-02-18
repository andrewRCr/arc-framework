# {{PROJECT_NAME}} - AI Agent Reference Card

**Version:** {{VERSION_DATE}} | **Source of truth:** `.arc/reference/`

## Project Overview

{{PROJECT_DESCRIPTION}}

**Project Type**: {{PROJECT_TYPE}}
**Primary Goal**: {{PRIMARY_GOAL}}

## Project Snapshot

**Technology Stack:**

- **Backend**: {{BACKEND_STACK}}
- **Frontend**: {{FRONTEND_STACK}}
- **Database**: {{DATABASE}}
- **Infrastructure**: {{INFRASTRUCTURE}}
- **External Services**: {{EXTERNAL_SERVICES}}

**Repository Layout:**

- `{{BACKEND_DIR}}/` - Backend code and configuration
- `{{FRONTEND_DIR}}/` - Frontend code and assets
- `.arc/` - Documentation (constitution, strategies, workflows, active/upcoming tasks)
- `{{INFRASTRUCTURE_DIR}}/` - Infrastructure configuration
- `{{VENV_PATH}}/` - Virtual environment (if applicable)

## Critical Path Information

**Common Friction Points:**

- **Docker Compose location**: `{{DOCKER_COMPOSE_PATH}}` (from repo root)
- **Backend venv**: `{{VENV_PATH}}/bin/` (from repo root)
- **Tests**: {{TEST_REQUIREMENTS}}
- **Working directory varies**: Check CURRENT-SESSION.md Session Startup Protocol for current context
- **Commands in QUICK-REFERENCE**: All assume repo root - adjust paths based on current working directory
- **Network architecture**: {{NETWORK_ARCHITECTURE}}

## AI Collaboration Principles

**Working Approach:**

- **Plan before executing** - Default to plan-driven execution; skip plans only for trivial tasks
- **Respect user intent** - Never revert or "fix" user changes without explicit approval
- **Stop on anomalies** - Treat unexpected filesystem diffs as a stop signal and request guidance
- **Limit scope** - Avoid global mutations or widespread changes without explicit approval
- **One task at a time** - Complete one checkbox item, report, and await approval before proceeding
- **Manual commit control** - AI NEVER initiates commits without explicit user approval or instruction
- **Verify before asserting** - Never guess file paths, implementation details, or content. Use Grep/Glob/Read
  to verify, or ask clarifying questions when uncertain. See DEVELOPMENT-RULES Verification Protocol.
- **Check strategy guidance** - Before implementing in codified domains, grep the relevant strategy doc.
  See STRATEGY-INDEX.md for available guidance.
- **Respect layered architecture** - Business logic belongs in appropriate layers, not in API/HTTP handlers.
  See DEVELOPMENT-RULES.md for details.

**Communication:**

- **Focus on value** - Prioritize findings, risks, and actionable next steps in summaries
- **Be clear and targeted** - Provide enough detail to be useful, not so much it's overwhelming

---

*This reference card is part of the ARC development framework. It provides
quick orientation and lookup guidance for AI assistants working on this project.*
