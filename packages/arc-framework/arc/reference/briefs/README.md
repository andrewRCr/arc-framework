# Briefs

Agent orientation documents loaded at session-init. Each brief covers one orientation concern — the ARC methodology,
the current project, and the contributor role variant.

**How briefs work:** Every session reads `AGENT-BRIEF.ARC.md` and `AGENT-BRIEF.PROJECT.md` — methodology orientation
plus project orientation. Contributor sessions (`git config arc.role = contributor`) additionally load
`AGENT-BRIEF.CONTRIBUTOR.md` for role-specific boundaries and conventions. The ARC + project split parallels
`DEV-RULES.ARC` (methodology) and `DEV-RULES.PROJECT` (project standards) — framework content and project content
kept in separate files with appropriate merge strategies.

**Loading model:** Briefs load in full at the top of the session-init load order — framework and project context
before active work state. See [session-init.md][session-init] Step 3.

## Files

| File                         | Classification | Role                                                |
| ---------------------------- | -------------- | --------------------------------------------------- |
| `AGENT-BRIEF.ARC.md`         | Framework      | ARC framework orientation — what ARC is, key docs   |
| `AGENT-BRIEF.PROJECT.md`     | Configurable   | Project context — stack, layout, friction points    |
| `AGENT-BRIEF.CONTRIBUTOR.md` | Framework      | Contributor role addendum — boundaries, conventions |

**Customize `AGENT-BRIEF.PROJECT.md`** to reflect your project's technology stack, repository layout, critical
friction points, and collaboration context. Init tokens (e.g., `{{PROJECT_NAME}}`) are filled by `arc init`;
guide-text placeholders are for you to complete manually.

`AGENT-BRIEF.ARC.md` and `AGENT-BRIEF.CONTRIBUTOR.md` are framework-managed — overwritten by `arc update` from
package source. Edit the package source if you're contributing changes upstream.

## Agent-Specific Guidance Lives Outside ARC

Briefs orient agents to ARC and the project. Agent-specific operational guidance — behavioral quirks, MCP server
configuration, sub-agent setup, sandbox semantics, capability limitations — belongs in harness-level files
(`CLAUDE.md`, `AGENTS.md`, `.gemini/GEMINI.md`, etc.), not in ARC.

Harness files load pre-session-init as system-prompt context. Each agent harness reads its own file, which makes
them the natural home for tool-specific guidance — agent-specific by design and already in context before any ARC
document loads.

---

[session-init]: ../../system/workflows/arc/session-lifecycle/session-init.md
