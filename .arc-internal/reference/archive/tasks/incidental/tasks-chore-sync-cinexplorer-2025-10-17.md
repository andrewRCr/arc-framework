# Tasks: Sync CineXplorer Refinements (2025-10-17)

## Overview

Sync battle-tested improvements from CineXplorer's `.arc/` documentation back to the framework repository.
This sync captures real-world refinements made during active development work.

**Status**: Complete
**Sync Date**: 2025-10-17
**Source**: `/home/andrew/dev/CineXplorer/.arc/`
**Target**: `/home/andrew/dev/arc-agentic-dev-framework/.arc/`
**Scope**: Stable documentation only (reference/, not active/upcoming/archive/)

## Relevant Files

### New Files to Add

- `.arc/active/CURRENT-SESSION.example.md` - Session template with Session Startup Protocol (completed)
- `.arc/reference/QUICK-REFERENCE.example.md` - Environment context and command patterns (completed)
- `.arc/reference/workflows/supplemental/maintain-task-notes.md` - Task list maintenance workflow (completed)
- `.arc/reference/ai-instructions/AGENTS.example.md` - Lean reference card (orientation, lookups, gotchas) (completed)
- `.arc/reference/ai-instructions/CLAUDE.example.md` - Minimal template (references AGENTS.md) (completed)
- `.arc/reference/ai-instructions/GEMINI.example.md` - Minimal template (references AGENTS.md) (completed)
- `.arc/reference/ai-instructions/WARP.example.md` - Minimal template (references AGENTS.md) (completed)
- `.arc/reference/ai-instructions/copilot-instructions.example.md` - Minimal template (references AGENTS.md) (completed)
- `.arc/reference/ai-instructions/README.md` - Architecture documentation (completed)
- `.arc/reference/workflows/supplemental/session-init.md` - Session initialization workflow (completed)
- `.arc/reference/strategies/` - Strategy document examples (optional Phase 3)

### Files to Update

- `.arc/reference/workflows/supplemental/session-handoff.md` - Working directory context improvements (completed)
- `.arc/reference/workflows/supplemental/archive-completed.md` - Cross-references to maintain-task-notes.md (completed)
- `.arc/reference/ai-instructions/AI-SHARED.example.md` - Removed (replaced by AGENTS.example.md) (completed)
- `.arc/active/CURRENT-SESSION.example.md` - Replaced Session Startup Protocol with reference to session-init.md (completed)
- `.arc-internal/active/CURRENT-SESSION.md` - Same update (completed)

### Internal Files

- `.arc-internal/active/CURRENT-SESSION.md` - Framework's own session file with Session Startup Protocol (completed)
- `.arc-internal/reference/QUICK-REFERENCE.md` - Framework-specific environment context (completed)
- `.arc-internal/reference/workflows/supplemental/sync-cinexplorer-refinements.md` - New workflow doc (completed in
  previous session)
- `.arc-internal/reference/workflows/supplemental/session-init.md` - Session initialization workflow (completed)
- `.arc-internal/reference/ai-instructions/CLAUDE.md` - Framework version of CLAUDE guidance (completed)
- `.arc-internal/reference/ai-instructions/GEMINI.md` - Framework version of GEMINI guidance (completed)
- `.arc-internal/reference/ai-instructions/WARP.md` - Framework version of WARP guidance (completed)
- `.arc-internal/reference/ai-instructions/copilot-instructions.md` - Framework version of Copilot guidance (completed)
- `.claude/commands/resume-current.md` - Updated to reference session-init.md (completed)

## Tasks

### Phase 0: CURRENT-SESSION.md with Session Startup Protocol

- [x] 0.1 Sync CURRENT-SESSION.md improvements
  - [x] 0.1.1 Read CineXplorer's CURRENT-SESSION.md and analyze Session Startup Protocol section
  - [x] 0.1.2 De-instance project-specific content (paths, Docker containers, venv paths, reference versions)
  - [x] 0.1.3 Update `.arc/active/CURRENT-SESSION.example.md` with Session Startup Protocol template
  - [x] 0.1.4 Update `.arc-internal/active/CURRENT-SESSION.md` (framework-specific version)
  - [x] 0.1.5 Update relevant workflows to reference Session Startup Protocol
  - [x] 0.1.6 Run markdown linting and fix any violations

### Phase 1: Critical Blockers (Prerequisites for Phase 0 Template Work)

- [x] 1.1 Add QUICK-REFERENCE.md
  - [x] 1.1.1 Read CineXplorer version and analyze structure
  - [x] 1.1.2 De-instance project-specific content (paths, ports, commands)
  - [x] 1.1.3 Add template placeholders ({{PROJECT_NAME}}, {{DOCKER_COMPOSE_PATH}}, etc.)
  - [x] 1.1.4 Create `.arc/reference/QUICK-REFERENCE.example.md`
  - [x] 1.1.5 Create `.arc-internal/reference/QUICK-REFERENCE.md` (framework-specific version)
  - [x] 1.1.6 Update DEVELOPMENT-RULES.md to reference QUICK-REFERENCE
  - [x] 1.1.7 Run markdown linting and fix any violations

- [x] 1.2 Add maintain-task-notes.md workflow
  - [x] 1.2.1 Read CineXplorer version and verify it's already generic
  - [x] 1.2.2 Copy to `.arc/reference/workflows/supplemental/maintain-task-notes.md`
  - [x] 1.2.3 Add cross-references to archive-completed.md where appropriate
  - [x] 1.2.4 Update workflows README to list new supplemental workflow (N/A - no README exists)
  - [x] 1.2.5 Run markdown linting and fix any violations

- [x] 1.3 Sync session-handoff.md improvements
  - [x] 1.3.1 Read both versions and create detailed diff analysis
  - [x] 1.3.2 Add working directory context warning section
  - [x] 1.3.3 Add stable vs dynamic sections guidance
  - [x] 1.3.4 Add pre-update verification protocol
  - [x] 1.3.5 Add stale state detection section (already complete - verified)
  - [x] 1.3.6 Run markdown linting and fix any violations

### Phase 2: High-Value AI Instructions (Revised Architecture)

**New Approach**: Consolidate AI-SHARED.md + AGENTS.md → AGENTS.md as central doc
**Rationale**: AGENTS.md provides auto-discovery for tools that support it, while reference chains work identically

- [x] 2.1 Create AGENTS.example.md (consolidated central doc)
  - [x] 2.1.1 Read CineXplorer's AI-SHARED.md (battle-tested, 53 lines)
  - [x] 2.1.2 Merge in Quick Start checklist from CineXplorer's AGENTS.md
  - [x] 2.1.3 De-instance project-specific content (CineXplorer → placeholders)
  - [x] 2.1.4 Create `.arc/reference/ai-instructions/AGENTS.example.md`
  - [x] 2.1.5 Remove AI-SHARED.example.md and AI-SHARED.md (replaced by AGENTS)
  - [x] 2.1.6 Run markdown linting and fix any violations

- [x] 2.2 Create CLAUDE.example.md (minimal template)
  - [x] 2.2.1 Extract Claude-specific tips from CineXplorer's CLAUDE.md
  - [x] 2.2.2 Create minimal template structure (references AGENTS.md + tool-specific section)
  - [x] 2.2.3 Create `.arc/reference/ai-instructions/CLAUDE.example.md`
  - [x] 2.2.4 Run markdown linting and fix any violations

- [x] 2.3 Create GEMINI.example.md (minimal template)
  - [x] 2.3.1 Check if CineXplorer has GEMINI.md (exists - extracted tips)
  - [x] 2.3.2 Create minimal template structure (identical to CLAUDE.example.md pattern)
  - [x] 2.3.3 Create `.arc/reference/ai-instructions/GEMINI.example.md`
  - [x] 2.3.4 Run markdown linting and fix any violations

- [x] 2.4 Create WARP.example.md (minimal template)
  - [x] 2.4.1 Extract Warp-specific tips from CineXplorer's WARP.md
  - [x] 2.4.2 Create minimal template structure (references AGENTS.md + tool-specific section)
  - [x] 2.4.3 Create `.arc/reference/ai-instructions/WARP.example.md`
  - [x] 2.4.4 Run markdown linting and fix any violations

- [x] 2.5 Create copilot-instructions.example.md (minimal template)
  - [x] 2.5.1 Check if CineXplorer has copilot-instructions.md (exists - extracted tips)
  - [x] 2.5.2 Create minimal template structure (identical to CLAUDE.example.md pattern)
  - [x] 2.5.3 Create `.arc/reference/ai-instructions/copilot-instructions.example.md`
  - [x] 2.5.4 Run markdown linting and fix any violations

- [x] 2.6 Update ai-instructions README
  - [x] 2.6.1 Document AGENTS.md as central shared doc
  - [x] 2.6.2 Explain tool-specific file pattern (inherit from AGENTS.md + add tool tips)
  - [x] 2.6.3 Note AI-SHARED removal and AGENTS.md replacement
  - [x] 2.6.4 Run markdown linting and fix any violations

### Phase 3: Strategy Examples

- [x] 3.1 Add work categorization strategy document
  - [x] 3.1.1 Read strategy-work-categorization.md from CineXplorer (.arc/upcoming/notes/)
  - [x] 3.1.2 Compare with other strategy documents (type-safety, testing, authentication)
  - [x] 3.1.3 De-instance content from "needs implementation" to "decided strategy"
  - [x] 3.1.4 Transform from CineXplorer-specific to framework-agnostic guidance
  - [x] 3.1.5 Create `.arc/reference/strategies/strategy-work-categorization.md` (serves as both example and reference)
  - [x] 3.1.6 Run markdown linting and fix line length violations

### Final Validation

- [x] 4.1 Cross-reference validation
  - [x] 4.1.1 Verify all internal links work in framework repo (links point to non-.example versions for adopters)
  - [x] 4.1.2 Verify all template placeholders are consistent (none needed - fully de-instanced)
  - [x] 4.1.3 Check for any CineXplorer-specific content that wasn't de-instanced (all clean)

- [x] 4.2 Quality gates
  - [x] 4.2.1 Run full markdown linting on all new/modified files (all passing)
  - [x] 4.2.2 Verify all files have proper frontmatter/headers (proper version header present)
  - [x] 4.2.3 Check that new files are referenced in appropriate READMEs (strategies/README.md updated)

- [x] 4.3 Framework documentation updates
  - [x] 4.3.1 Update main README.md (minimal: added technical/ to planned work section)
  - [x] 4.3.2 Update ADOPTION.md (no changes needed - work categorization covered in DEVELOPMENT-RULES)
  - [x] 4.3.3 Update CHANGELOG.md with comprehensive sync summary (Phase 0-3 work documented)

## Notes

### De-Instancing Patterns

Common transformations when syncing from CineXplorer:

- Project name: `CineXplorer` → `{{PROJECT_NAME}}`
- Paths: `/home/andrew/dev/CineXplorer/` → `{{REPO_ROOT}}/`
- Ports: `8000`, `5173`, `8444` → `{{BACKEND_PORT}}`, `{{FRONTEND_PORT}}`, `{{PROXY_PORT}}`
- Tech stack: Specific tech → Generic descriptions or placeholders
- Commands: Project-specific → Template with placeholders
- Docker paths: Specific compose file locations → `{{DOCKER_COMPOSE_PATH}}`

### Sync Scope Reminders

**Include**:

- `.arc/reference/` directory (constitution, workflows, ai-instructions, strategies)
- Stable documentation improvements
- Generic patterns and processes

**Exclude**:

- `.arc/active/` (instance-specific work)
- `.arc/upcoming/` (instance-specific planning)
- `.arc/archive/` (instance-specific history)
- Project-specific implementation details

### AI Instructions Architecture - New Design

**Decision (2025-10-17)**: Consolidate AI-SHARED.md and AGENTS.md into single AGENTS.md

**Rationale**:

- **Auto-discovery**: Tools that natively look for AGENTS.md get immediate access
- **Reference chains work identically**: Tools like Claude Code that look for CLAUDE.md → AGENTS.md work the same
- **Battle-tested content**: Use CineXplorer's lean AI-SHARED.md (53 lines) as foundation
- **Minimal tool-specific templates**: All tool files use identical structure, clearly showing inheritance pattern

**Architecture**:

```
AGENTS.md (central, comprehensive)
├── CLAUDE.md → references AGENTS.md + Claude tips
├── GEMINI.md → references AGENTS.md + Gemini tips
├── WARP.md → references AGENTS.md + Warp tips
└── copilot-instructions.md → references AGENTS.md + Copilot tips
```

**Template Philosophy**: Tool-specific .example.md files use identical minimal structure to teach the pattern
