# GEMINI.md

<!--
ARC Framework Template: Copy this file as GEMINI.md and customize for your project
- This is a minimal template - most guidance lives in AGENTS.md
- Only add Gemini-specific tips here (not general project context)
- Keep this file lean - reference AGENTS.md for shared context
-->

Guidance for Gemini when working in this repository. For shared rules and architecture, defer to the canonical docs:

- [AGENTS](AGENTS.md) – Project context, lookup guide, and collaboration principles
- [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) {{RULES_VERSION}} – Non-negotiable standards
- [QUICK-REFERENCE](../QUICK-REFERENCE.md) {{QUICKREF_VERSION}} – Environment context and command patterns
- [Process Task Loop](../workflows/3-process-task-loop.md) – One-subtask workflow

## Gemini-Specific Notes

<!--
Customize this section with Gemini-specific tips for your project:
- CLI usage patterns
- Wide repository analysis strategies
- Limitation handling
- Cross-tool handoff practices
- Summary format preferences
-->

- **Session startup:** Execute Session Startup Protocol in CURRENT-SESSION.md first (verify working directory,
  runtime status, tool availability, paths)
- **Gemini CLI usage:** For analysis requiring wide repository coverage (patterns across many files, >100 KB of code),
  consider using Gemini CLI - confirm directories and scope before running
- **Surface limitations:** If shell commands aren't available in current environment, state this upfront and offer
  alternatives (search strategies, manual verification steps)
- **Summaries:** Provide compact answers with numbered action plans when asked for implementation steps
- **Cross-tool handoff:** When performing large audits or analysis, document findings in CURRENT-SESSION.md so other
  AI tools can continue work seamlessly
