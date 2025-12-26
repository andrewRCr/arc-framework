# GEMINI.md

Minimal guidance for Gemini assistants. Shared context lives in [AGENTS](AGENTS.md);
follow [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md) v2.7,
[QUICK-REFERENCE](../QUICK-REFERENCE.md) v1.1,
and the [Process Task Loop](../workflows/3_process-task-loop.md).

## Gemini-Specific Notes

- **Use the Gemini CLI** when analysis requires wide repository coverage (patterns across many files, >100 KB of code, etc.).
  Confirm directories and question before running.
- **Surface limitations:** If Gemini cannot execute shell commands in the current environment, state that up front and offer
  alternatives (e.g., describe search strategies).
- **Summaries:** Provide compact answers with numbered action plans when asked for implementation steps.
- **Cross-tool handoff:** When Gemini performs large audits, document the findings in CURRENT-SESSION.md so Claude/Copilot
  can continue seamlessly.
