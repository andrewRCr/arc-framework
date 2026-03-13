# {{PROJECT_NAME}} — AI Agent Reference Card

## Project Overview

{{PROJECT_DESCRIPTION}}

**Project Type**: [PROJECT_TYPE]
**Primary Goal**: [PRIMARY_GOAL]

## Project Snapshot

**Technology Stack:**

<!-- List the major components of your stack. Adapt categories to your project type: -->
<!-- Web app: Language, Framework, Frontend, Database, Infrastructure -->
<!-- CLI tool: Language, Package manager, Distribution format -->
<!-- Library: Language, Build system, Test framework, Documentation tool -->

- **[Component]**: [technology, version, notes]
- **[Component]**: [technology, version, notes]
- **Quality Gates**: [primary quality tools — linters, type checkers, test runners]
- **Infrastructure**: [hosting, CI/CD, containerization if applicable]

**Repository Layout:**

<!-- List the top-level directories an agent needs to know about -->

- `[src_dir]/` - [description]
- `[test_dir]/` - [description]
- `{{ARC_DIR}}/` - Development documentation (constitution, strategies, workflows, active tasks)
- [additional directories as needed]

## Critical Path Information

**Common Friction Points:**

<!-- Document the gotchas that waste agent time — things that aren't obvious from the code. -->
<!-- Examples: "tests require a running database", "config lives in an unexpected location", -->
<!-- "two build systems coexist", "working directory matters for certain commands" -->

- [Friction point with context]
- [Friction point with context]

## Project-Specific Principles

_[None — add project-specific agent guidance as you discover it]_

<!-- This section is for principles specific to YOUR project that aren't covered by -->
<!-- ARC's constitutional docs (DEV-RULES.ARC, DEV-RULES.PROJECT). Examples: -->
<!-- - **Respect layered architecture** - Business logic in service layer, not handlers -->
<!-- - **Stop on co-dev anomalies** - Flag filesystem changes that conflict with the -->
<!--   current task, but treat co-development diffs as normal -->
<!-- - **Feature flags required** - All new features behind flags until validated -->

---

_This reference card is the shared entry point for all AI agents working on this project.
Agent-specific guidance lives in dedicated files._
