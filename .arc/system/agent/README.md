# AI Instructions Directory

This directory contains AI-specific instruction files that guide different AI tools when working with projects using
the ARC framework.

## Architecture

The AI instructions follow a **minimal inheritance pattern** built around `AGENTS.md` — both an ARC convention
and an emerging industry standard (stewarded by the Linux Foundation's Agentic AI Foundation).

```
AGENTS.md (central reference card — industry-standard format)
├── CLAUDE.md → references AGENTS.md + Claude-specific guidance
├── CODEX.md → references AGENTS.md + Codex-specific guidance
├── CURSOR.md → references AGENTS.md + Cursor-specific guidance
├── GEMINI.md → references AGENTS.md + Gemini-specific guidance
├── WARP.md → references AGENTS.md + Warp-specific guidance
├── WINDSURF.md → references AGENTS.md + Windsurf-specific guidance
└── copilot-instructions.md → references AGENTS.md + Copilot-specific guidance
```

### Why AGENTS.md as Hub

`AGENTS.md` is an emerging industry standard — an increasing number of AI coding tools recognize it
from the project root. ARC uses the same format for interoperability but keeps files here in `.arc/system/agent/`
rather than at tool-native locations (see [File Placement](#file-placement) below). ARC's session-init
workflow (manually invoked each session) handles the loading chain: AGENTS.md first for shared
context, then the appropriate tool-specific file.

**Why tool-specific files, even for tools that read AGENTS.md natively?** Different agents have different
quirks — behavioral tendencies, capability limitations, platform-specific features. This agent-specific
guidance doesn't belong in shared project context.

### File Placement

Files live in `.arc/system/agent/` rather than where tools natively look (project root, `.github/`,
`.claude/`, etc.). This is deliberate:

- **Containment** — all agent configuration in one directory, managed as part of ARC
- **No conflict** — won't overwrite pre-existing tool configs already in your project
- **Controlled loading** — session-init reads files in the right order (shared context → tool-specific)
- **Layering possible** — you can still place additional config at tool-native locations for
  guidance that lives outside ARC, layered on top

### Design Principles

1. **AGENTS.md is the central hub** — project overview, quick lookup guide, and AI collaboration principles
2. **Tool files hold agent-specific guidance only** — each file references AGENTS.md and adds only what's
   unique to that agent (behavioral quirks, capability limitations, platform features)
3. **No duplication** — shared context lives in AGENTS.md and constitutional docs, not repeated in tool files
4. **ARC manages loading** — session-init reads files in order; files don't need to live where tools natively look
5. **Contained and non-conflicting** — all agent config lives here, won't overwrite existing tool configs
6. **Extensible** — adopters can add files for any tool following the same pattern

### What Belongs in Agent-Specific Files

Agent-specific files are for guidance that applies to **one agent but not others**. If it applies to all
agents, it belongs in a shared doc (AGENTS.md, DEV-RULES, a workflow, or a strategy).

**Good examples:**

- Behavioral tendencies you want to curb for one specific agent
- Platform-specific features (MCP server configuration, sub-agent setup)
- Capability limitations that affect how ARC workflows execute on that agent
- Tool-specific interaction patterns (permission models, sandbox constraints)

**Does NOT belong here:**

- Project context, technology stack, repository layout → AGENTS.md
- Development methodology, commit discipline, session management → DEV-RULES, workflows
- Quality gates, testing requirements → DEV-RULES.PROJECT
- Generic best practices that apply to all agents → AGENTS.md collaboration principles

## Files in This Directory

### AGENTS.template.md

**Purpose**: Central reference card for all AI tools — the shared entry point.

**When to customize**: Update with your project-specific technology stack, repository layout,
critical friction points, and collaboration principles.

### Agent-Specific Templates

All agent templates ship with the same minimal structure and no pre-filled agent-specific content:

- Reference links to shared constitutional and workflow docs
- Agent-specific notes section (placeholder + commented examples of what belongs here)
- MCP server and sub-agent configuration sections (placeholders)

Templates are provided for: **Claude**, **Codex**, **Copilot**, **Cursor**, **Gemini**, **Warp**,
**Windsurf**. Remove templates for tools you don't use.

**Why empty by default:** Agent-specific guidance should come from your own experience with each tool
in your project context. Shipping pre-filled content would impose generic preferences, create merge
conflicts during framework updates, and contradict the principle that these files are project-owned.

### Adding Files for Other Tools

1. Create a minimal file following the same pattern: reference AGENTS.md, add tool-specific guidance
2. Ensure your session-init workflow reads the new file after AGENTS.md

## Adoption Guide

### For New Projects

1. **Customize AGENTS.md first** with your project-specific technology stack, layout, and friction points
2. **Keep only the agent files you use** — remove the rest
3. **Leave agent-specific notes empty** until you discover genuine agent-specific guidance through use
4. **Configure MCP/sub-agent sections** as you set up your tooling

### Customization Tips

**AGENTS.md (most important)**:

- Init tokens (`{{PROJECT_NAME}}`, `{{ARC_DIR}}`) are filled automatically by `arc init`
- Guide-text placeholders (`[Component]`, `[description]`) are for you to fill in manually
- Update "Project Snapshot" with your tech stack
- Customize "Critical Path Information" with your project's gotchas

**Tool-specific files**:

- Start with the placeholder — add guidance only when you discover real agent-specific quirks
- Keep them minimal (reference AGENTS.md for shared context)
- If guidance applies to all agents, put it in a shared doc instead

## Maintenance

### When to Update AGENTS.md

- Project technology stack changes
- New critical friction points discovered
- Repository structure evolves
- Workflow file locations change
- New collaboration principles emerge

### When to Update Tool-Specific Files

- Agent-specific behavioral quirk discovered through use
- Platform-specific feature configured (MCP servers, sub-agents)
- Capability limitation identified that affects ARC workflow execution

---

**Maintenance:** Update this README and file descriptions when adding new tool templates or when the
AGENTS.md architecture evolves.
