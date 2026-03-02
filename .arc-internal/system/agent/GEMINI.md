# GEMINI.md

Minimal guidance for Gemini assistants. Shared context lives in [AGENTS](AGENTS.md);
follow [DEV-RULES.ARC][dev-rules-arc],
[DEVELOPMENT-RULES][dev-rules] v0.3.0-dev (hash: 8c5f2a91),
[QUICK-REFERENCE][quick-ref] v0.3.0-dev,
and the [Process Task Loop][process-task-loop].

## Gemini-Specific Notes

- **Use the Gemini CLI** when analysis requires wide repository coverage (patterns across many files, >100 KB of code, etc.).
  Confirm directories and question before running.
- **Surface limitations:** If Gemini cannot execute shell commands in the current environment, state that up front and offer
  alternatives (e.g., describe search strategies).
- **Summaries:** Provide compact answers with numbered action plans when asked for implementation steps.
- **Cross-tool handoff:** When Gemini performs large audits, document findings in SESSION.md so other agents can continue
  seamlessly.

---

[dev-rules-arc]: ../../../.arc/reference/constitution/DEV-RULES.ARC.md
[dev-rules]: ../../reference/constitution/DEVELOPMENT-RULES.md
[quick-ref]: ../../reference/QUICK-REFERENCE.md
[process-task-loop]: ../../../.arc/system/workflows/arc/3_process-task-loop.md
