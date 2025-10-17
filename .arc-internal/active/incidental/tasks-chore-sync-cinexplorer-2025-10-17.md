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

- `.arc/active/CURRENT-SESSION.example.md` - Session template with Session Startup Protocol
- `.arc/reference/QUICK-REFERENCE.md` - Environment context and command patterns
- `.arc/reference/workflows/supplemental/maintain-task-notes.md` - Task list maintenance workflow
- `.arc/reference/ai-instructions/AGENTS.md` - Unified AI agent quick-start
- `.arc/reference/ai-instructions/CLAUDE.md` - Claude-specific guidance
- `.arc/reference/ai-instructions/GEMINI.md` - Gemini CLI guidance
- `.arc/reference/ai-instructions/copilot-instructions.md` - GitHub Copilot alignment
- `.arc/reference/strategies/` - Strategy document examples (optional Phase 2)

### Files to Update

- `.arc/reference/workflows/supplemental/session-handoff.md` - Working directory context improvements
- `.arc/reference/ai-instructions/AI-SHARED.example.md` - Consider lean variant
- `.arc/reference/ai-instructions/WARP.example.md` - Minor improvements

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

- [ ] 1.1 Add QUICK-REFERENCE.md
  - [ ] 1.1.1 Read CineXplorer version and analyze structure
  - [ ] 1.1.2 De-instance project-specific content (paths, ports, commands)
  - [ ] 1.1.3 Add template placeholders ({{PROJECT_NAME}}, {{DOCKER_COMPOSE_PATH}}, etc.)
  - [ ] 1.1.4 Create `.arc/reference/QUICK-REFERENCE.example.md`
  - [ ] 1.1.5 Create `.arc-internal/reference/QUICK-REFERENCE.md` (framework-specific version)
  - [ ] 1.1.6 Update DEVELOPMENT-RULES.md to reference QUICK-REFERENCE
  - [ ] 1.1.7 Run markdown linting and fix any violations

- [ ] 1.2 Add maintain-task-notes.md workflow
  - [ ] 1.2.1 Read CineXplorer version and verify it's already generic
  - [ ] 1.2.2 Copy to `.arc/reference/workflows/supplemental/maintain-task-notes.md`
  - [ ] 1.2.3 Add cross-references to archive-completed.md where appropriate
  - [ ] 1.2.4 Update workflows README to list new supplemental workflow
  - [ ] 1.2.5 Run markdown linting and fix any violations

- [ ] 1.3 Sync session-handoff.md improvements
  - [ ] 1.3.1 Read both versions and create detailed diff analysis
  - [ ] 1.3.2 Add working directory context warning section
  - [ ] 1.3.3 Add stable vs dynamic sections guidance
  - [ ] 1.3.4 Add pre-update verification protocol
  - [ ] 1.3.5 Add stale state detection section
  - [ ] 1.3.6 Run markdown linting and fix any violations

### Phase 2: High-Value AI Instructions

- [ ] 2.1 Add AGENTS.md
  - [ ] 2.1.1 Read CineXplorer version and verify it's generic
  - [ ] 2.1.2 Copy to `.arc/reference/ai-instructions/AGENTS.md`
  - [ ] 2.1.3 Update ai-instructions README to reference new file
  - [ ] 2.1.4 Run markdown linting and fix any violations

- [ ] 2.2 Add CLAUDE.md
  - [ ] 2.2.1 Read CineXplorer version and verify it's generic
  - [ ] 2.2.2 Copy to `.arc/reference/ai-instructions/CLAUDE.md`
  - [ ] 2.2.3 Ensure cross-references to AGENTS.md are correct
  - [ ] 2.2.4 Run markdown linting and fix any violations

- [ ] 2.3 Add GEMINI.md
  - [ ] 2.3.1 Read CineXplorer version and verify it's generic
  - [ ] 2.3.2 Copy to `.arc/reference/ai-instructions/GEMINI.md`
  - [ ] 2.3.3 Ensure cross-references are correct
  - [ ] 2.3.4 Run markdown linting and fix any violations

- [ ] 2.4 Add copilot-instructions.md
  - [ ] 2.4.1 Read CineXplorer version and verify it's generic
  - [ ] 2.4.2 Copy to `.arc/reference/ai-instructions/copilot-instructions.md`
  - [ ] 2.4.3 Update ai-instructions README to reference new file
  - [ ] 2.4.4 Run markdown linting and fix any violations

- [ ] 2.5 Consider AI-SHARED lean variant
  - [ ] 2.5.1 Analyze CineXplorer's leaner approach (53 lines vs 266)
  - [ ] 2.5.2 Decide: Replace current template OR add as alternate pattern
  - [ ] 2.5.3 If alternate: Create AI-SHARED-LEAN.example.md
  - [ ] 2.5.4 Document when to use template vs lean approach
  - [ ] 2.5.5 Run markdown linting and fix any violations

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

### Success Criteria

- [ ] All Phase 1 tasks complete (critical blockers resolved)
- [ ] QUICK-REFERENCE properly de-instanced with clear template placeholders
- [ ] maintain-task-notes workflow integrated into framework
- [ ] session-handoff improvements synced
- [ ] Zero markdown linting violations
- [ ] All internal links verified
- [ ] Framework documentation updated to reflect new files
