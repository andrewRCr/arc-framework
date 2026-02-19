# AI Instructions Directory

This directory contains AI-specific instruction files that guide different AI tools when working with projects using
the ARC framework.

## Architecture

The AI instructions follow a **minimal inheritance pattern** built around `AGENTS.md` — both an ARC convention
and an industry standard (stewarded by the Linux Foundation's Agentic AI Foundation, adopted by 60,000+ projects).

```
AGENTS.md (central reference card — industry-standard format)
├── CLAUDE.md → references AGENTS.md + Claude-specific guidance
├── GEMINI.md → references AGENTS.md + Gemini-specific guidance
├── WARP.md → references AGENTS.md + Warp-specific guidance
└── copilot-instructions.md → references AGENTS.md + Copilot-specific guidance
```

### Why AGENTS.md as Hub

`AGENTS.md` is an industry standard — tools like Gemini, Cursor, and Windsurf natively auto-discover
it at project root. ARC uses the same format for interoperability but keeps files here in `.arc/reference/agent/`
rather than at tool-native locations (see [File Placement](#file-placement) below). ARC's session-init workflow
handles loading: AGENTS.md first for shared context, then the appropriate tool-specific file.

**Why tool-specific files, even for tools that read AGENTS.md natively?** Different models have different
quirks — context window thresholds, output format preferences, capability limitations, autonomous work
protocols. This model-specific guidance doesn't belong in shared project context.

### File Placement

Files live in `.arc/reference/agent/` rather than where tools natively look (project root, `.github/`,
`.claude/`, etc.). This is deliberate:

- **Containment** — all agent configuration in one directory, managed as part of ARC
- **No conflict** — won't overwrite pre-existing tool configs already in your project
- **Controlled loading** — session-init reads files in the right order (shared context → tool-specific)
- **Layering possible** — you can still place additional config at tool-native locations for
  guidance that lives outside ARC, layered on top

### Design Principles

1. **AGENTS.md is the central hub** — project overview, quick lookup guide, and AI collaboration principles
2. **Tool files hold model-specific guidance** — each file (~20-40 lines) references AGENTS.md and adds only
   what's unique to that model (quirks, capabilities, context management, communication preferences)
3. **No duplication** — shared context lives in AGENTS.md, not repeated in tool files
4. **ARC manages loading** — session-init reads files in order; files don't need to live where tools natively look
5. **Contained and non-conflicting** — all agent config lives here, won't overwrite existing tool configs
6. **Extensible** — adopters can add files for any tool following the same pattern

## Files in This Directory

### AGENTS.example.md

**Purpose**: Central reference card for all AI tools

**Contents**:

- Project overview and technology stack snapshot
- Critical friction points and gotchas
- Quick lookup guide ("How do I...?", "What are the rules for...?", "Where is...?")
- AI collaboration principles (plan-first, respect user changes, stop on anomalies, etc.)

**When to customize**: When adopting ARC framework, update with your project-specific:

- Technology stack details
- Runtime environment specifics
- Project-specific friction points
- Repository layout and conventions

### CLAUDE.example.md

**Purpose**: Claude-specific guidance (minimal template)

**Contents**:

- Reference to AGENTS.md for shared context
- Session startup reminders
- Path awareness notes
- Communication preferences (summaries first, clarifying questions)
- Large diff handling strategies

**When to customize**: Add Claude-specific guidance for your project (typically 5-10 bullet points)

### GEMINI.example.md

**Purpose**: Gemini-specific guidance (minimal template)

**Contents**:

- Reference to AGENTS.md for shared context
- Gemini CLI usage patterns
- Limitation surface handling
- Summary format preferences
- Cross-tool handoff practices

**When to customize**: Add Gemini-specific guidance for your project (typically 5-10 bullet points)

### WARP.example.md

**Purpose**: Warp terminal-specific guidance (minimal template)

**Contents**:

- Reference to AGENTS.md for shared context
- Shell syntax preferences
- Command focus areas (Docker, native scripts, etc.)
- Quality gate shortcuts
- Environment verification patterns

**When to customize**: Add Warp-specific guidance for your project (typically 5-10 bullet points)

### copilot-instructions.example.md

**Purpose**: GitHub Copilot-specific guidance (minimal template)

**Contents**:

- Reference to AGENTS.md for shared context
- Context snippet best practices
- Command hint patterns
- Code style reminders
- Testing prompt strategies
- Tool deferral corrections

**When to customize**: Add Copilot-specific guidance for your project (typically 5-10 bullet points)

### Adding Files for Other Tools

ARC ships with templates for the tools above, but the pattern works with any AI coding assistant. To add support
for another tool (e.g., Cursor, Windsurf, or a future tool):

1. Create a minimal file following the same pattern: reference AGENTS.md, add tool-specific guidance
2. Ensure your session-init workflow reads the new file after AGENTS.md
3. If the tool uses a structured config format (e.g., `.cursor/rules/*.mdc`), include a pointer to AGENTS.md
   for shared project context

## Adoption Guide

### For New Projects

1. **Copy all `.example.md` files** from this directory to your project's `.arc/reference/agent/`
2. **Rename files** by removing `.example` extension:
   - `AGENTS.example.md` → `AGENTS.md`
   - `CLAUDE.example.md` → `CLAUDE.md`
   - etc.
3. **Customize AGENTS.md first** with your project-specific:
   - Technology stack
   - Repository layout
   - Critical friction points
   - Common workflows
4. **Customize tool-specific files** with guidance relevant to your project
5. **Remove unused tool files** if you don't use certain AI tools

### Customization Tips

**AGENTS.md (most important)**:

- Replace `{{PROJECT_NAME}}` and other placeholders with actual values
- Update "Project Snapshot" with your tech stack
- Customize "Critical Path Information" with your project's gotchas
- Update "Quick Lookup Guide" with your actual workflow file paths

**Tool-specific files**:

- Keep them minimal (reference AGENTS.md for shared context)
- Add only tool-specific guidance (not general project information)
- Use placeholders like `{{TOOL_AVAILABILITY}}` for project-specific values
- Focus on how to use the tool effectively in your project

## Maintenance

### When to Update AGENTS.md

- Project technology stack changes
- New critical friction points discovered
- Repository structure evolves
- Workflow file locations change
- New collaboration principles emerge

### When to Update Tool-Specific Files

- Tool-specific best practices discovered
- Project conventions change
- New quality gates or commands added
- Tool-specific gotchas identified

### Keeping Files in Sync

When constitutional documents change (DEVELOPMENT-RULES.md, TECHNICAL-OVERVIEW.md, etc.), check if AGENTS.md
needs updates to reflect new:

- Quality standards
- Architectural patterns
- Development processes
- Project priorities

---

**Maintenance:** Update this README and file descriptions when adding new tool templates or when the
AGENTS.md architecture evolves.
