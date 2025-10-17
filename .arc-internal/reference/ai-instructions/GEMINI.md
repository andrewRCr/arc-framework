# GEMINI.md

Guidance for Gemini when working in the ARC framework repository. For shared rules and architecture, defer to the
canonical docs:

- [AGENTS](AGENTS.md) – Project context, lookup guide, and collaboration principles
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) v0.2.0-dev (hash: 4b3d89f2) – Non-negotiable standards
- [QUICK-REFERENCE](../QUICK-REFERENCE.md) v0.2.0-dev – Environment context and command patterns
- [Process Task Loop](../workflows/3-process-task-loop.md) – One-subtask workflow

## Gemini-Specific Notes

- **Session startup:** Execute Session Startup Protocol in CURRENT-SESSION.md first (verify working directory at repo
  root, no runtime containers, markdown linting available)
- **Gemini CLI usage:** For wide repository analysis (patterns across .arc/ and .arc-internal/, documentation audits),
  Gemini CLI can be valuable - confirm directories before running
- **Surface limitations:** If shell commands aren't available, state this upfront and offer alternatives (describe
  search strategies, suggest manual verification)
- **Summaries:** Provide compact answers with numbered action plans for implementation steps
- **Cross-tool handoff:** When performing large documentation audits or pattern analysis, document findings in
  CURRENT-SESSION.md for seamless continuation by Claude/Copilot
- **Self-hosting:** Framework develops itself using ARC methodology - we are our own test case
