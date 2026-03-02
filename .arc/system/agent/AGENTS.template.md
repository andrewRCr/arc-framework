# {{PROJECT_NAME}} - AI Agent Reference Card

## Project Overview

{{PROJECT_DESCRIPTION}}

**Project Type**: {{PROJECT_TYPE}}
**Primary Goal**: {{PRIMARY_GOAL}}

## Project Snapshot

**Technology Stack:**

<!-- List the major components of your stack. Adapt categories to your project type: -->
<!-- Web app: Language, Framework, Frontend, Database, Infrastructure -->
<!-- CLI tool: Language, Package manager, Distribution format -->
<!-- Library: Language, Build system, Test framework, Documentation tool -->

- **{{Component}}**: {{technology, version, notes}}
- **{{Component}}**: {{technology, version, notes}}
- **Quality Gates**: {{primary quality tools — linters, type checkers, test runners}}
- **Infrastructure**: {{hosting, CI/CD, containerization if applicable}}

**Repository Layout:**

<!-- List the top-level directories an agent needs to know about -->

- `{{src_dir}}/` - {{description}}
- `{{test_dir}}/` - {{description}}
- `.arc/` - Development documentation (constitution, strategies, workflows, active tasks)
- {{additional directories as needed}}

## Critical Path Information

**Common Friction Points:**

<!-- Document the gotchas that waste agent time — things that aren't obvious from the code. -->
<!-- Examples: "tests require a running database", "config lives in an unexpected location", -->
<!-- "two build systems coexist", "working directory matters for certain commands" -->

- {{Friction point with context}}
- {{Friction point with context}}
- **Commands in `QUICK-REFERENCE.md`**: All assume repo root — adjust paths based on working directory
- **Working directory**: Check `CURRENT-SESSION.md` for current context

## AI Collaboration Principles

**Working Approach:**

- **Plan before executing** - Default to plan-driven execution; skip plans only for trivial tasks
- **Respect user intent** - Never revert or "fix" user changes without explicit approval
- **Stop on anomalies** - Treat unexpected filesystem diffs as a stop signal and request guidance.
  Note: the developer may be working alongside you — editing files, running commands, making
  commits. Co-development diffs are normal, not anomalies. Flag only changes that conflict
  with your current task or seem unintentional.
- **Limit scope** - Avoid global mutations or widespread changes without explicit approval
- **One task at a time** - Complete one checkbox item, report, and await approval before proceeding
  (per developer-agent pair in team mode)
- **Manual commit control** - AI NEVER initiates commits without explicit user approval or instruction
- **Verify before asserting** - Never guess file paths, implementation details, or content.
  Use search/read tools to verify, or ask clarifying questions when uncertain.
  See `DEV-RULES.ARC.md` § Verification and Discovery.
- **Check strategy guidance** - Before implementing in codified domains, consult the relevant
  strategy doc. See `STRATEGY-INDEX.md` for available guidance.

<!-- Add project-specific principles as needed. Examples: -->
<!-- - **Respect layered architecture** - Business logic in service layer, not in handlers -->
<!-- - **Feature flags required** - All new features behind flags until validated -->

**Communication:**

- **Focus on value** - Prioritize findings, risks, and actionable next steps in summaries
- **Be clear and targeted** - Provide enough detail to be useful, not so much it's overwhelming

---

*This reference card is part of the ARC development framework. It provides
quick orientation for AI assistants working on this project.*
