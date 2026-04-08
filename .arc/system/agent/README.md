# AI Instructions Directory

This directory contains AI-specific instruction files that guide different AI tools when working with projects using
the ARC framework.

## Architecture

The AI instructions follow a **dual-hub pattern** with tool-specific extensions:

```
AGENT-BRIEFING.ARC.md (ARC framework orientation — shared by all agents)
AGENT-BRIEFING.PROJECT.md (project context — stack, layout, friction points)
├── CLAUDE.ARC.md → tool-specific guidance for Claude Code
├── CODEX.ARC.md → tool-specific guidance for Codex
├── CURSOR.ARC.md → tool-specific guidance for Cursor
├── GEMINI.ARC.md → tool-specific guidance for Gemini
├── WARP.ARC.md → tool-specific guidance for Warp
├── WINDSURF.ARC.md → tool-specific guidance for Windsurf
└── COPILOT.ARC.md → tool-specific guidance for GitHub Copilot
```

### Why Two Hub Files

**AGENT-BRIEFING.ARC.md** (Framework classification) covers ARC itself — what it is, how it works, key documents,
directory structure. This content is maintained by the framework and auto-merged on updates. It provides
a stable orientation that never conflicts with project-specific edits.

**AGENT-BRIEFING.PROJECT.md** (Configurable classification) covers your project — overview, technology stack,
repository layout, friction points. This content is yours to customize; the framework provides a template
with guidance placeholders.

This split parallels `DEV-RULES.ARC.md` (methodology) and `DEV-RULES.PROJECT.md` (project standards) —
framework content and project content in separate files with appropriate merge strategies.

### File Placement

Files live in `.arc/system/agent/` rather than where tools natively look (project root, `.github/`,
`.claude/`, etc.). This is deliberate:

- **Containment** — all agent configuration in one directory, managed as part of ARC
- **No conflict** — won't overwrite pre-existing tool configs already in your project
- **Controlled loading** — session-init reads files in the right order (ARC → project → tool-specific)
- **Layering possible** — you can still place additional config at tool-native locations for
  guidance that lives outside ARC, layered on top

### Design Principles

1. **Two hubs, distinct concerns** — AGENT-BRIEFING.ARC.md for framework orientation,
   AGENT-BRIEFING.PROJECT.md for project context
2. **Tool files hold tool-specific guidance only** — each file references both hubs and adds only what's unique to
   that tool (behavioral quirks, capability limitations, platform features)
3. **No duplication** — shared context lives in hub files and constitutional docs, not repeated in tool files
4. **ARC manages loading** — session-init reads files in order; files don't need to live where tools natively look
5. **Contained and non-conflicting** — all agent config lives here, won't overwrite existing tool configs
6. **Extensible** — adopters can add files for any tool following the same pattern

### What Belongs in Tool-Specific Files

Tool-specific files are for guidance that applies to **one tool but not others**. If it applies to all
tools, it belongs in a shared doc (AGENT-BRIEFING.PROJECT.md, DEV-RULES, a workflow, or a strategy).

**Good examples:**

- Behavioral tendencies you want to curb for one specific tool
- Platform-specific features (MCP server configuration, sub-agent setup)
- Capability limitations that affect how ARC workflows execute on that tool
- Tool-specific interaction patterns (permission models, sandbox constraints)

**Does NOT belong here:**

- Project context, technology stack, repository layout → AGENT-BRIEFING.PROJECT.md
- Development methodology, commit discipline, session management → DEV-RULES, workflows
- Quality gates, testing requirements → DEV-RULES.PROJECT
- Generic best practices that apply to all tools → AGENT-BRIEFING.PROJECT.md

## Files in This Directory

### AGENT-BRIEFING.ARC.md

**Purpose**: ARC framework orientation for agents — what ARC is, how it works, key documents.

**Classification**: Framework (auto-merged on update). Not customized by adopters.

### AGENT-BRIEFING.PROJECT.md

**Purpose**: Project-specific reference card for all AI tools — the project entry point.

**When to customize**: Update with your project-specific technology stack, repository layout,
critical friction points, and collaboration context.

### Tool-Specific Templates

All tool templates ship with the same minimal structure and no pre-filled tool-specific content:

- Reference links to shared constitutional and workflow docs
- Tool-specific notes section (placeholder + commented examples)
- MCP server and sub-agent configuration sections (placeholders)

Templates are provided for: **Claude Code**, **Codex**, **Copilot**, **Cursor**, **Gemini**, **Warp**,
**Windsurf**. Remove templates for tools you don't use.

**Why empty by default:** Tool-specific guidance should come from your own experience with each tool
in your project context. Shipping pre-filled content would impose generic preferences, create merge
conflicts during framework updates, and contradict the principle that these files are project-owned.

### Adding Files for Other Tools

1. Create a minimal file following the same pattern: reference both hub files, add tool-specific guidance
2. Ensure your session-init workflow reads the new file after AGENT-BRIEFING.PROJECT.md

## Adoption Guide

### For New Projects

1. **AGENT-BRIEFING.ARC.md loads automatically** — no customization needed
2. **Customize AGENT-BRIEFING.PROJECT.md** with your project-specific technology stack, layout, and friction points
3. **Keep only the tool files you use** — remove the rest
4. **Leave tool-specific notes empty** until you discover genuine tool-specific guidance through use
5. **Configure MCP and sub-agent sections** as you set up your tooling

### Customization Tips

**AGENT-BRIEFING.PROJECT.md (most important)**:

- Init tokens (`{{PROJECT_NAME}}`) are filled automatically by `arc init`
- Guide-text placeholders (`[Component]`, `[description]`) are for you to fill in manually
- Update "Project Snapshot" with your tech stack
- Customize "Critical Path Information" with your project's gotchas

**Tool-specific files**:

- Start with the placeholder — add guidance only when you discover real tool-specific quirks
- Keep them minimal (reference hub files for shared context)
- If guidance applies to all tools, put it in a shared doc instead

## Maintenance

### When to Update AGENT-BRIEFING.PROJECT.md

- Project technology stack changes
- New critical friction points discovered
- Repository structure evolves
- Workflow file locations change

### When to Update Tool-Specific Files

- Tool-specific behavioral quirk discovered through use
- Platform-specific feature configured (MCP servers, sub-agents)
- Capability limitation identified that affects ARC workflow execution

---

**Maintenance:** Update this README and file descriptions when adding new tool templates or when the
agent file architecture evolves.
