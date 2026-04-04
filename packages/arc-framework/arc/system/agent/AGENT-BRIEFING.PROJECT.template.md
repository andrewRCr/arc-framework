# AGENT-BRIEFING.PROJECT.md — {{PROJECT_NAME}} Orientation for Agents

<!-- This file is an agent-facing executive summary. META-PRD.md (reference/constitution/)
     and TECHNICAL-OVERVIEW.md (reference/) contain the full versions. Keep this file
     concise — agents load it every session. -->

## Project Overview

[Brief project description — filled during project definition (`02_define-project`)]

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
- `.arc/` - Development documentation (constitution, strategies, workflows, active tasks)
- [additional directories as needed]

## Critical Path Information

**Common Friction Points:**

<!-- Document the gotchas that waste agent time — things that aren't obvious from the code. -->
<!-- Examples: "tests require a running database", "config lives in an unexpected location", -->
<!-- "two build systems coexist", "working directory matters for certain commands" -->

- [Friction point with context]
- [Friction point with context]

---

_This is the project-specific entry point for AI agents. ARC framework orientation lives in
[AGENT-BRIEFING.ARC.md](AGENT-BRIEFING.ARC.md). Agent-specific guidance lives in dedicated
files (e.g., CLAUDE.ARC.md, CODEX.ARC.md)._
