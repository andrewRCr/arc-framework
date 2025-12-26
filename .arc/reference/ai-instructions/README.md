# AI Instructions Directory

This directory contains AI-specific instruction files that guide different AI tools when working with projects using
the ARC framework.

## Architecture

The AI instructions follow a **minimal inheritance pattern**:

```
AGENTS.md (central reference card)
├── CLAUDE.md → references AGENTS.md + Claude-specific tips
├── GEMINI.md → references AGENTS.md + Gemini-specific tips
├── WARP.md → references AGENTS.md + Warp-specific tips
└── copilot-instructions.md → references AGENTS.md + Copilot-specific tips
```

### Design Principles

1. **AGENTS.md is the central hub** - Contains project overview, quick lookup guide, and AI collaboration principles
2. **Tool files are minimal** - Each tool file (~20-40 lines) references AGENTS.md and adds only tool-specific tips
3. **No duplication** - Shared context lives in AGENTS.md, not repeated in tool files
4. **Auto-discovery support** - Tools that look for AGENTS.md get immediate access to shared context
5. **Reference chains work** - Tools that look for their specific file (e.g., CLAUDE.md) are directed to AGENTS.md

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

**When to customize**: Add Claude-specific tips for your project (typically 5-10 bullet points)

### GEMINI.example.md

**Purpose**: Gemini-specific guidance (minimal template)

**Contents**:

- Reference to AGENTS.md for shared context
- Gemini CLI usage patterns
- Limitation surface handling
- Summary format preferences
- Cross-tool handoff practices

**When to customize**: Add Gemini-specific tips for your project (typically 5-10 bullet points)

### WARP.example.md

**Purpose**: Warp terminal-specific guidance (minimal template)

**Contents**:

- Reference to AGENTS.md for shared context
- Shell syntax preferences
- Command focus areas (Docker, native scripts, etc.)
- Quality gate shortcuts
- Environment verification patterns

**When to customize**: Add Warp-specific tips for your project (typically 5-10 bullet points)

### copilot-instructions.example.md

**Purpose**: GitHub Copilot-specific guidance (minimal template)

**Contents**:

- Reference to AGENTS.md for shared context
- Context snippet best practices
- Command hint patterns
- Code style reminders
- Testing prompt strategies
- Tool deferral corrections

**When to customize**: Add Copilot-specific tips for your project (typically 5-10 bullet points)

## Adoption Guide

### For New Projects

1. **Copy all `.example.md` files** from this directory to your project's `.arc/reference/ai-instructions/`
2. **Rename files** by removing `.example` extension:
   - `AGENTS.example.md` → `AGENTS.md`
   - `CLAUDE.example.md` → `CLAUDE.md`
   - etc.
3. **Customize AGENTS.md first** with your project-specific:
   - Technology stack
   - Repository layout
   - Critical friction points
   - Common workflows
4. **Customize tool-specific files** with tips relevant to your project
5. **Remove unused tool files** if you don't use certain AI tools

### Customization Tips

**AGENTS.md (most important)**:

- Replace `{{PROJECT_NAME}}` and other placeholders with actual values
- Update "Project Snapshot" with your tech stack
- Customize "Critical Path Information" with your project's gotchas
- Update "Quick Lookup Guide" with your actual workflow file paths

**Tool-specific files**:

- Keep them minimal (reference AGENTS.md for shared context)
- Add only tool-specific tips (not general project information)
- Use placeholders like `{{TOOL_AVAILABILITY}}` for project-specific values
- Focus on how to use the tool effectively in your project

## Migration from Previous Versions

### If You Have AI-SHARED.md

The old `AI-SHARED.md` has been replaced by `AGENTS.md`:

1. **Copy content** from your `AI-SHARED.md` into `AGENTS.md`
2. **Remove duplication** - eliminate any content that duplicates CURRENT-SESSION.md, DEVELOPMENT-RULES.md, or
   QUICK-REFERENCE.md
3. **Add Quick Lookup Guide** - create "How do I...?" / "What are the rules for...?" / "Where is...?" sections
4. **Delete AI-SHARED.md** after migration

### Why the Change?

- **Auto-discovery**: Some AI tools natively look for `AGENTS.md`
- **Clearer naming**: "AGENTS" better describes the file's purpose than "AI-SHARED"
- **Reference chains work identically**: Tools still follow CLAUDE.md → AGENTS.md pattern

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

When constitutional documents change (DEVELOPMENT-RULES.md, TECHNICAL-ARCHITECTURE.md, etc.), check if AGENTS.md
needs updates to reflect new:

- Quality standards
- Architectural patterns
- Development processes
- Project priorities

---

**Version**: 2025-10-17 (Initial version documenting new AGENTS.md architecture)
