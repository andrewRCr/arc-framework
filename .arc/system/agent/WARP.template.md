# WARP.md

Guidance for Warp terminal assistance. For shared rules and architecture, defer to the canonical docs:

- [AGENTS](AGENTS.md) – Project context and collaboration principles
- [DEV-RULES.ARC](../../reference/constitution/DEV-RULES.ARC.md) – Framework development methodology
- [DEV-RULES.PROJECT](../../reference/constitution/DEV-RULES.PROJECT.md) – Project quality standards
- [QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md) – Environment context and command patterns

## Warp-Specific Notes

- **Shell syntax:** Prefer cross-platform command syntax where possible
- **Command focus:** Reference the commands listed in QUICK-REFERENCE (assume repo root paths);
  surface them as ready-to-run snippets when asked to run checks
- **Environment checks:** Confirm available tooling (build tools, test runners, services) before
  proposing actions — check QUICK-REFERENCE for what's expected
- **Hand-offs:** When finishing terminal automation, update CURRENT-SESSION.md (or state "no update
  required") and mention any long-running commands left active
