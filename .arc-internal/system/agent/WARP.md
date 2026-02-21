# WARP.md

Guidance for Warp terminal assistance. For shared rules and architecture, defer to the canonical docs:

- [AGENTS](AGENTS.md) – Project context, lookup guide, and collaboration principles
- [DEVELOPMENT-RULES](../../reference/constitution/DEVELOPMENT-RULES.md) v0.3.0-dev (hash: 8c5f2a91) – Non-negotiable standards
- [QUICK-REFERENCE](../../reference/QUICK-REFERENCE.md) v0.3.0-dev – Environment context and command patterns

## Warp-Specific Notes

- **Shell syntax:** Prefer PowerShell-formatted commands when suggesting terminal usage
  (`docker-compose` → `docker compose` works cross-platform)
- **Command focus:** Prioritize Docker-based workflows; remind users to exec into containers rather than running host-only
  scripts unless instructed
- **Quality gates shorthand:** Reference the commands listed in QUICK-REFERENCE (assume repo root paths);
  surface them as PowerShell snippets when asked to run checks
- **Environment checks:** Confirm whether the warp session has Docker and git access before proposing actions
- **Hand-offs:** When finishing terminal automation, update CURRENT-SESSION.md (or state "no update required")
  and mention any long-running commands left active
