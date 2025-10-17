# Tasks: Sync CineXplorer Refinements (2025-10-17)

## Overview

Sync battle-tested improvements from CineXplorer's `.arc/` documentation back to the framework repository.
This sync captures real-world refinements made during active development work.

**Sync Date**: 2025-10-17
**Source**: `/home/andrew/dev/CineXplorer/.arc/`
**Target**: `/home/andrew/dev/arc-agentic-dev-framework/.arc/`
**Scope**: Stable documentation only (reference/, not active/upcoming/archive/)

## Relevant Files

### New Files to Add

- `.arc/active/CURRENT-SESSION.example.md` - Session template with Session Startup Protocol (completed)
- `.arc/reference/QUICK-REFERENCE.example.md` - Environment context and command patterns (completed)
- `.arc/reference/workflows/supplemental/maintain-task-notes.md` - Task list maintenance workflow (completed)
- `.arc/reference/ai-instructions/AGENTS.example.md` - Central shared doc (consolidates AI-SHARED + Quick Start)
- `.arc/reference/ai-instructions/CLAUDE.example.md` - Minimal template (references AGENTS.md)
- `.arc/reference/ai-instructions/GEMINI.example.md` - Minimal template (references AGENTS.md)
- `.arc/reference/ai-instructions/WARP.example.md` - Minimal template (references AGENTS.md)
- `.arc/reference/ai-instructions/copilot-instructions.example.md` - Minimal template (references AGENTS.md)
- `.arc/reference/strategies/` - Strategy document examples (optional Phase 4)

### Files to Update

- `.arc/reference/workflows/supplemental/session-handoff.md` - Working directory context improvements (completed)
- `.arc/reference/workflows/supplemental/archive-completed.md` - Cross-references to maintain-task-notes.md (completed)
- `.arc/reference/ai-instructions/AI-SHARED.example.md` - Add deprecation notice (replaced by AGENTS.example.md)
- `.arc/reference/ai-instructions/README.md` - Document new AGENTS.md architecture

### Internal Files

- `.arc-internal/active/CURRENT-SESSION.md` - Framework's own session file with Session Startup Protocol
- `.arc-internal/reference/QUICK-REFERENCE.md` - Framework-specific environment context
- `.arc-internal/reference/workflows/supplemental/sync-cinexplorer-refinements.md` - New workflow doc

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

- [ ] 2.1 Create AGENTS.example.md (consolidated central doc)
  - [ ] 2.1.1 Read CineXplorer's AI-SHARED.md (battle-tested, 53 lines)
  - [ ] 2.1.2 Merge in Quick Start checklist from CineXplorer's AGENTS.md
  - [ ] 2.1.3 De-instance project-specific content (CineXplorer → placeholders)
  - [ ] 2.1.4 Create `.arc/reference/ai-instructions/AGENTS.example.md`
  - [ ] 2.1.5 Add deprecation notice to existing AI-SHARED.example.md
  - [ ] 2.1.6 Run markdown linting and fix any violations

- [ ] 2.2 Create CLAUDE.example.md (minimal template)
  - [ ] 2.2.1 Extract Claude-specific tips from CineXplorer's CLAUDE.md
  - [ ] 2.2.2 Create minimal template structure (references AGENTS.md + tool-specific section)
  - [ ] 2.2.3 Create `.arc/reference/ai-instructions/CLAUDE.example.md`
  - [ ] 2.2.4 Run markdown linting and fix any violations

- [ ] 2.3 Create GEMINI.example.md (minimal template)
  - [ ] 2.3.1 Check if CineXplorer has GEMINI.md (likely doesn't exist)
  - [ ] 2.3.2 Create minimal template structure (identical to CLAUDE.example.md pattern)
  - [ ] 2.3.3 Create `.arc/reference/ai-instructions/GEMINI.example.md`
  - [ ] 2.3.4 Run markdown linting and fix any violations

- [ ] 2.4 Create WARP.example.md (minimal template)
  - [ ] 2.4.1 Extract Warp-specific tips from CineXplorer's WARP.md
  - [ ] 2.4.2 Create minimal template structure (references AGENTS.md + tool-specific section)
  - [ ] 2.4.3 Create `.arc/reference/ai-instructions/WARP.example.md`
  - [ ] 2.4.4 Run markdown linting and fix any violations

- [ ] 2.5 Create copilot-instructions.example.md (minimal template)
  - [ ] 2.5.1 Check if CineXplorer has copilot-instructions.md (likely doesn't exist)
  - [ ] 2.5.2 Create minimal template structure (identical to CLAUDE.example.md pattern)
  - [ ] 2.5.3 Create `.arc/reference/ai-instructions/copilot-instructions.example.md`
  - [ ] 2.5.4 Run markdown linting and fix any violations

- [ ] 2.6 Update ai-instructions README
  - [ ] 2.6.1 Document AGENTS.md as central shared doc
  - [ ] 2.6.2 Explain tool-specific file pattern (inherit from AGENTS.md + add tool tips)
  - [ ] 2.6.3 Note AI-SHARED.example.md deprecation
  - [ ] 2.6.4 Run markdown linting and fix any violations

### Phase 3: Internal Workflow Documentation

- [ ] 3.1 Create sync-cinexplorer-refinements.md workflow
  - [ ] 3.1.1 Document purpose and when to run sync
  - [ ] 3.1.2 Document what to sync (stable content only, exclusions)
  - [ ] 3.1.3 Document de-instancing requirements and patterns
  - [ ] 3.1.4 Document validation checklist
  - [ ] 3.1.5 Document task list creation process (naming, dating)
  - [ ] 3.1.6 Add examples of common de-instancing patterns
  - [ ] 3.1.7 Run markdown linting and fix any violations

### Phase 4: Strategy Examples (Optional - Can Be Future Sync)

- [ ] 4.1 Add strategy document examples
  - [ ] 4.1.1 Read strategy-authentication.md from CineXplorer
  - [ ] 4.1.2 De-instance and rename to generic pattern (e.g., strategy-dual-auth-pattern.example.md)
  - [ ] 4.1.3 Add as example showing mature strategy document structure
  - [ ] 4.1.4 Consider adding other strategy docs as examples
  - [ ] 4.1.5 Update strategies README to reference examples
  - [ ] 4.1.6 Run markdown linting and fix any violations

### Final Validation

- [ ] 5.1 Cross-reference validation
  - [ ] 5.1.1 Verify all internal links work in framework repo
  - [ ] 5.1.2 Verify all template placeholders are consistent
  - [ ] 5.1.3 Check for any CineXplorer-specific content that wasn't de-instanced

- [ ] 5.2 Quality gates
  - [ ] 5.2.1 Run full markdown linting on all new/modified files
  - [ ] 5.2.2 Verify all files have proper frontmatter/headers
  - [ ] 5.2.3 Check that new files are referenced in appropriate READMEs

- [ ] 5.3 Framework documentation updates
  - [ ] 5.3.1 Update main README.md if new capabilities added
  - [ ] 5.3.2 Update ADOPTION.md if workflow changes
  - [ ] 5.3.3 Update CHANGELOG.md with sync summary

- [ ] 5.4 Prepare for commit
  - [ ] 5.4.1 Review all changes with git diff
  - [ ] 5.4.2 Verify commit message plan follows conventional commits
  - [ ] 5.4.3 Await user approval for commit

## Notes

### Session Startup Protocol - Critical Innovation

The **Session Startup Protocol** section in CineXplorer's CURRENT-SESSION.md (lines 3-42) represents a major
breakthrough in AI collaboration:

**Why It Matters**:

- Solves persistent working directory confusion (AI often forgets repo root context)
- Prevents Docker/venv path errors before they happen
- Forces environment verification at session start
- Links to QUICK-REFERENCE for command context
- Establishes "ground truth" before any work begins

**Key Components**:

1. **Working directory verification** (`pwd` check with expected output)
2. **Docker status check** (container count validation)
3. **Venv availability** (tool presence verification)
4. **Path context table** (critical paths from current working directory)
5. **Acknowledgment protocol** (AI must state orientation)
6. **Reference check** (version-aware document access confirmation)

**De-Instancing Requirements**:

- Container names/counts → Generic placeholders
- Specific paths → `{{DOCKER_COMPOSE_PATH}}`, `{{VENV_PATH}}`, etc.
- Tool names → Generic quality gate tools
- Version numbers → Placeholder references

This protocol should become standard in all ARC session files.

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

### Success Criteria

- [x] Phase 0 complete (Session Startup Protocol synced)
- [x] Phase 1 complete (critical blockers resolved)
  - [x] QUICK-REFERENCE properly de-instanced with clear template placeholders
  - [x] maintain-task-notes workflow integrated into framework
  - [x] session-handoff improvements synced
- [ ] Phase 2 complete (AI instructions with new architecture)
  - [ ] AGENTS.example.md created (consolidated central doc)
  - [ ] All tool-specific templates follow identical minimal pattern
  - [ ] AI-SHARED.example.md deprecated with notice
- [ ] Zero markdown linting violations across all files
- [ ] All internal links verified
- [ ] Framework documentation updated to reflect new architecture
