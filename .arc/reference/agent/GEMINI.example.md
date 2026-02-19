# GEMINI.md

Minimal guidance for Gemini assistants. Shared context lives in [AGENTS](AGENTS.md);
follow [DEVELOPMENT-RULES](../constitution/DEVELOPMENT-RULES.md),
[QUICK-REFERENCE](../QUICK-REFERENCE.md),
and the [Process Task Loop](../workflows/3_process-task-loop.md).

## Gemini-Specific Notes

- **Wide repository coverage:** Use Gemini CLI capabilities when analysis spans many files or large
  code volumes. Confirm directories and question before running.
- **Surface limitations:** If Gemini cannot execute shell commands in the current environment, state
  that up front and offer alternatives (e.g., describe search strategies).
- **Summaries:** Provide compact answers with numbered action plans when asked for implementation steps.
- **Cross-tool handoff:** When Gemini performs large audits, document findings in CURRENT-SESSION.md
  so other agents can continue seamlessly.
