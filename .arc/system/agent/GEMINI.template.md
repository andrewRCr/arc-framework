# GEMINI.md

Minimal guidance for Gemini assistants. Shared context lives in [AGENTS](AGENTS.md);
follow [DEV-RULES.ARC](../../reference/constitution/DEV-RULES.ARC.md),
[DEV-RULES.PROJECT](../../reference/constitution/DEV-RULES.PROJECT.md),
[QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md),
and the [Process Task Loop](../workflows/arc/3_process-task-loop.md).

## Gemini-Specific Notes

- **Wide repository coverage:** Use Gemini CLI capabilities when analysis spans many files or large
  code volumes. Confirm directories and question before running.
- **Surface limitations:** If Gemini cannot execute shell commands in the current environment, state
  that up front and offer alternatives (e.g., describe search strategies).
- **Summaries:** Provide compact answers with numbered action plans when asked for implementation steps.
- **Cross-tool handoff:** When Gemini performs large audits, document findings in SESSION-NOTES.md so other agents can
  continue seamlessly.
